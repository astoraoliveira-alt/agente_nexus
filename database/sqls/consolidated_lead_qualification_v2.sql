-- 1. Add lifecycle_status and ensure updated_at exists
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(50) DEFAULT 'lead';

-- 2. Update save_evaluation to include CRM Intelligence
CREATE OR REPLACE FUNCTION save_evaluation(
    p_conversation_id UUID,
    p_score INT,
    p_summary TEXT,
    p_tags TEXT[],
    p_criteria JSONB,
    p_model VARCHAR DEFAULT 'n8n-auto'
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
    v_new_status VARCHAR;
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
    
    -- 3. Trigger Incident if Score is Low (< 40)
    IF p_score < 40 THEN
        INSERT INTO incidents (tenant_id, agent_id, title, description, severity, status, reported_by)
        VALUES (
            v_tenant_id, v_agent_id,
            'Low Quality Interaction Detected (Score: ' || p_score || ')',
            'Automated Audit Flag: ' || p_summary,
            'medium', 'open', NULL
        );
    END IF;

    -- 4. ⚡ CRM Intelligence: Automatic Lead Qualification
    -- Logic: >=80 Lead Quente, >=50 Interesse Médio, else Interesse Baixo
    v_new_status := CASE 
        WHEN p_score >= 80 THEN 'Lead Quente'
        WHEN p_score >= 50 THEN 'Interesse Médio'
        ELSE 'Interesse Baixo'
    END;

    IF v_user_identifier IS NOT NULL THEN
        UPDATE contacts
        SET lifecycle_status = v_new_status,
            tags = array_cat(COALESCE(tags, '{}'::text[]), p_tags),
            updated_at = NOW()
        WHERE identifier = v_user_identifier
          AND tenant_id = v_tenant_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'evaluation_id', v_eval_id, 'contact_status', v_new_status);
EXCEPTION WHEN OTHERS THEN
    -- Return error info if it crashes
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
