-- 1. Add conversation_id to Incidents (if not exists)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'incidents' AND column_name = 'conversation_id') THEN
        ALTER TABLE incidents ADD COLUMN conversation_id UUID REFERENCES conversations(id);
        CREATE INDEX idx_incidents_conversation ON incidents(conversation_id);
    END IF;
END $$;

-- 2. Update save_evaluation RPC to include conversation_id and improve threshold
CREATE OR REPLACE FUNCTION save_evaluation(
    p_conversation_id UUID,
    p_score INT,
    p_summary TEXT,
    p_tags TEXT[],
    p_criteria JSONB,
    p_model VARCHAR DEFAULT 'n8n-auto',
    p_sentiment VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_agent_id UUID;
    v_eval_id UUID;
    v_user_identifier VARCHAR;
    v_contact_updated BOOLEAN;
    v_new_status VARCHAR;
    v_final_sentiment VARCHAR;
    v_inferred_sentiment VARCHAR;
BEGIN
    -- 1. Resolve Tenant and Agent from Conversation
    SELECT tenant_id, agent_id, user_identifier INTO v_tenant_id, v_agent_id, v_user_identifier
    FROM conversations
    WHERE id = p_conversation_id;
    
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Conversation not found';
    END IF;

    -- 2. Insert Evaluation
    INSERT INTO evaluations (
        tenant_id,
        conversation_id,
        agent_id,
        score,
        summary,
        tags,
        criteria_results,
        ai_model
    ) VALUES (
        v_tenant_id,
        p_conversation_id,
        v_agent_id,
        p_score,
        p_summary,
        p_tags,
        p_criteria,
        p_model
    )
    RETURNING id INTO v_eval_id;
    
    -- 3. Trigger Incident if Score is Low (<= 50)
    IF p_score <= 50 THEN
        INSERT INTO incidents (
            tenant_id,
            agent_id,
            conversation_id, 
            title,
            description,
            severity,
            status,
            reported_by
        ) VALUES (
            v_tenant_id,
            v_agent_id,
            p_conversation_id,
            'Low Quality Interaction Detected (Score: ' || p_score || ')',
            'Automated Audit Flag: ' || p_summary || E'\n\nTags: ' || array_to_string(p_tags, ', '),
            'medium',
            'open',
            NULL 
        );
    END IF;

    -- 4. CRM Sync logic
    v_contact_updated := FALSE;
    v_new_status := CASE WHEN p_score >= 80 THEN 'sql' WHEN p_score >= 50 THEN 'mql' ELSE 'lead' END;
    v_inferred_sentiment := CASE WHEN p_score >= 80 THEN 'interessado' WHEN p_score >= 60 THEN 'positivo' WHEN p_score >= 40 THEN 'neutro' ELSE 'preocupado' END;
    v_final_sentiment := COALESCE(p_sentiment, v_inferred_sentiment);

    IF v_user_identifier IS NOT NULL THEN
        UPDATE contacts
        SET lifecycle_status = v_new_status,
            tags = ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(tags, '{}'::text[]), p_tags))),
            sentiment = COALESCE(sentiment, v_final_sentiment),
            updated_at = NOW()
        WHERE identifier = v_user_identifier AND tenant_id = v_tenant_id;
        
        IF FOUND THEN v_contact_updated := TRUE; END IF;
        
        UPDATE conversations SET sentiment = v_final_sentiment WHERE id = p_conversation_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'evaluation_id', v_eval_id, 'contact_updated', v_contact_updated);
END;
$$;
