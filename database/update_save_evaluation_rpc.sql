-- RPC: save_evaluation (CRM Sync Update)
-- Updates the CRM Sync logic inside save_evaluation to also handle sentiment if passed in tags or inferred.
-- DEBUG VERSION: Returns contact update checks

CREATE OR REPLACE FUNCTION save_evaluation(
    p_conversation_id UUID,
    p_score INT,
    p_summary TEXT,
    p_tags TEXT[],
    p_criteria JSONB,
    p_model VARCHAR DEFAULT 'n8n-auto',
    p_sentiment VARCHAR DEFAULT NULL -- New optional parameter for explicit sentiment
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
    -- Increased threshold to catch more issues (Hall of Shame usually implies attention needed)
    IF p_score <= 50 THEN
        INSERT INTO incidents (
            tenant_id,
            agent_id,
            conversation_id, -- Linked to conversation
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
            NULL -- System reported
        );
    END IF;

    -- 4. ⚡ Intelligent Lead Qualification (CRM Sync)
    v_contact_updated := FALSE;

    -- Logic: >=80 SQL, >=50 MQL, else Lead
    v_new_status := CASE 
        WHEN p_score >= 80 THEN 'sql'
        WHEN p_score >= 50 THEN 'mql'
        ELSE 'lead'
    END;

    -- Sentiment Strategy: Explicit > Inferred from Score
    v_inferred_sentiment := CASE 
        WHEN p_score >= 80 THEN 'interessado'
        WHEN p_score >= 60 THEN 'positivo'
        WHEN p_score >= 40 THEN 'neutro'
        ELSE 'preocupado'
    END;
    
    v_final_sentiment := COALESCE(p_sentiment, v_inferred_sentiment);

    IF v_user_identifier IS NOT NULL THEN
        UPDATE contacts
        SET lifecycle_status = v_new_status,
            tags = ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(tags, '{}'::text[]), p_tags))),
            sentiment = COALESCE(sentiment, v_final_sentiment),
            updated_at = NOW()
        WHERE identifier = v_user_identifier
          AND tenant_id = v_tenant_id;
          
        IF FOUND THEN
            v_contact_updated := TRUE;
        END IF;
          
         -- Also update conversation sentiment if missing or explicit
        UPDATE conversations 
        SET sentiment = v_final_sentiment
        WHERE id = p_conversation_id;

    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'evaluation_id', v_eval_id, 
        'contact_updated', v_contact_updated,
        'debug_identifier', v_user_identifier,
        'new_status', v_new_status,
        'tags_added', p_tags
    );

EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Erro ao qualificar lead na auditoria: %', SQLERRM;
END;
$$;
