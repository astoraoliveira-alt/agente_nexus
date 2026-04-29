-- =============================================
-- MASTER ORCHESTRATOR RPC (High Performance)
-- Purpose: Consolidate 4+ sequential n8n calls into ONE atomic operation.
-- Logic: Lookup Agent -> Check Status -> Check Limit -> Get/Create Conv -> Get Context
-- =============================================

CREATE OR REPLACE FUNCTION n8n_orchestrator_v1(
    p_instance_name TEXT,
    p_user_identifier TEXT,
    p_user_name TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_agent_id UUID;
    v_tenant_id UUID;
    v_agent_status VARCHAR;
    v_company_status VARCHAR;
    v_max_concurrency INT;
    v_active_conv_count INT;
    v_conversation_id UUID;
    v_reopened BOOLEAN := FALSE;
    v_agent_config JSONB;
    v_messages JSONB;
    v_knowledge JSONB;
    v_contact_id UUID;
BEGIN
    -- 1. Lookup Agent by Evolution Instance
    SELECT id, tenant_id, status, max_concurrency, brain_config
    INTO v_agent_id, v_tenant_id, v_agent_status, v_max_concurrency, v_agent_config
    FROM agents
    WHERE evolution_instance = p_instance_name
    LIMIT 1;

    IF v_agent_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Agente não encontrado para esta instância.', 'code', 'AGENT_NOT_FOUND');
    END IF;

    -- 2. Check Agent & Company Status
    SELECT status INTO v_company_status FROM companies WHERE id = v_tenant_id;
    
    IF v_company_status != 'active' THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Empresa suspensa ou inativa.', 'code', 'COMPANY_INACTIVE');
    END IF;

    IF v_agent_status != 'active' THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Agente está inativo.', 'code', 'AGENT_INACTIVE');
    END IF;

    -- 3. Check Concurrency Limits
    SELECT COUNT(*) INTO v_active_conv_count
    FROM conversations
    WHERE agent_id = v_agent_id AND status = 'ai_active';

    IF v_active_conv_count >= v_max_concurrency THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Limite de conversas simultâneas atingido.', 'code', 'LIMIT_EXCEEDED');
    END IF;

    -- 4. Get or Create Conversation (Atomic Logic)
    SELECT id, status INTO v_conversation_id, v_agent_status -- reusing variable for current status
    FROM conversations
    WHERE tenant_id = v_tenant_id
      AND agent_id = v_agent_id
      AND user_identifier = p_user_identifier
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_conversation_id IS NULL THEN
        INSERT INTO conversations (tenant_id, agent_id, user_identifier, user_name, channel, status, metadata)
        VALUES (v_tenant_id, v_agent_id, p_user_identifier, p_user_name, 'whatsapp', 'ai_active', p_metadata)
        RETURNING id INTO v_conversation_id;
    ELSIF v_agent_status = 'closed' THEN
        UPDATE conversations SET status = 'ai_active', last_message_at = NOW(), user_name = p_user_name
        WHERE id = v_conversation_id;
        v_reopened := TRUE;
    ELSE
        UPDATE conversations SET last_message_at = NOW(), user_name = p_user_name
        WHERE id = v_conversation_id;
    END IF;

    -- 5. Sync Contact
    INSERT INTO contacts (tenant_id, identifier, name, channel)
    VALUES (v_tenant_id, p_user_identifier, p_user_name, 'whatsapp')
    ON CONFLICT (identifier) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();

    -- 6. Fetch Context (History & Knowledge)
    SELECT jsonb_agg(sub) INTO v_messages
    FROM (
        SELECT sender_type, content
        FROM messages
        WHERE conversation_id = v_conversation_id
        ORDER BY created_at DESC
        LIMIT 10
    ) sub;

    SELECT jsonb_agg(content) INTO v_knowledge
    FROM agent_knowledge
    WHERE agent_id = v_agent_id;

    -- 7. RETURN SUCCESS PACKAGE
    RETURN jsonb_build_object(
        'status', 'success',
        'agent', jsonb_build_object(
            'id', v_agent_id,
            'name', (SELECT name FROM agents WHERE id = v_agent_id),
            'tenantId', v_tenant_id,
            'systemPrompt', v_agent_config->>'systemPrompt',
            'userPromptTemplate', v_agent_config->>'userPromptTemplate',
            'modelId', v_agent_config->>'modelId',
            'temperature', (v_agent_config->>'temperature')::NUMERIC,
            'maxTokens', (v_agent_config->>'maxTokens')::INT
        ),
        'conversation', jsonb_build_object(
            'id', v_conversation_id,
            'reopened', v_reopened,
            'history', COALESCE(v_messages, '[]'::jsonb),
            'knowledge', COALESCE(v_knowledge, '[]'::jsonb)
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION n8n_orchestrator_v1(TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION n8n_orchestrator_v1(TEXT, TEXT, TEXT, JSONB) TO service_role;
