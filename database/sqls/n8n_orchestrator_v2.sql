-- =============================================
-- MASTER ORCHESTRATOR RPC v2 (Governance Mode)
-- Purpose: Consolidate logic AND return granular status flags for n8n treatment.
-- Version: v2 (Following Versioning Strategy)
-- =============================================

CREATE OR REPLACE FUNCTION n8n_orchestrator_v2(
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
    -- Governance Flags
    v_agente_encontrado BOOLEAN := FALSE;
    v_agente_ativo BOOLEAN := FALSE;
    v_empresa_ativa BOOLEAN := FALSE;
    v_limite_atingido BOOLEAN := FALSE;
    v_clean_identifier TEXT;
BEGIN
    -- Sanitização: Remove o conteúdo do @ para frente (ex: @s.whatsapp.net)
    v_clean_identifier := split_part(p_user_identifier, '@', 1);

    -- 1. Lookup Agent by Evolution Instance
    SELECT id, tenant_id, status, max_concurrency, brain_config
    INTO v_agent_id, v_tenant_id, v_agent_status, v_max_concurrency, v_agent_config
    FROM agents
    WHERE evolution_instance = p_instance_name
    LIMIT 1;

    -- Update Flags
    IF v_agent_id IS NOT NULL THEN
        v_agente_encontrado := TRUE;
        v_agente_ativo := (v_agent_status = 'active');
        
        -- Check Company
        SELECT status INTO v_company_status FROM companies WHERE id = v_tenant_id;
        v_empresa_ativa := (v_company_status = 'active');
        
        -- Check Concurrency
        SELECT COUNT(*) INTO v_active_conv_count
        FROM conversations
        WHERE agent_id = v_agent_id AND status = 'ai_active';
        
        v_limite_atingido := (v_active_conv_count >= v_max_concurrency);
    END IF;

    -- 2. Validate for Execution
    IF NOT v_agente_encontrado OR NOT v_agente_ativo OR NOT v_empresa_ativa OR v_limite_atingido THEN
        RETURN jsonb_build_object(
            'status', 'blocked',
            'governance', jsonb_build_object(
                'agente_encontrado', v_agente_encontrado,
                'agente_ativo', v_agente_ativo,
                'empresa_ativa', v_empresa_ativa,
                'limite_atingido', v_limite_atingido,
                'qnt_transacoes_correntes', COALESCE(v_active_conv_count, 0),
                'max_concurrency', COALESCE(v_max_concurrency, 0)
            )
        );
    END IF;

    -- 3. Get or Create Conversation (Atomic Logic)
    SELECT id, status INTO v_conversation_id, v_agent_status -- reuse agent_status var for current status
    FROM conversations
    WHERE tenant_id = v_tenant_id
      AND agent_id = v_agent_id
      AND user_identifier = v_clean_identifier
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_conversation_id IS NULL THEN
        INSERT INTO conversations (tenant_id, agent_id, user_identifier, user_name, channel, status, metadata)
        VALUES (v_tenant_id, v_agent_id, v_clean_identifier, p_user_name, 'whatsapp', 'ai_active', p_metadata)
        RETURNING id INTO v_conversation_id;
    ELSIF v_agent_status = 'closed' THEN
        UPDATE conversations SET status = 'ai_active', last_message_at = NOW(), user_name = p_user_name
        WHERE id = v_conversation_id;
        v_reopened := TRUE;
    ELSE
        UPDATE conversations SET last_message_at = NOW(), user_name = p_user_name
        WHERE id = v_conversation_id;
    END IF;

    -- 4. Sync Contact
    INSERT INTO contacts (tenant_id, identifier, name, channel)
    VALUES (v_tenant_id, v_clean_identifier, p_user_name, 'whatsapp')
    ON CONFLICT (tenant_id, identifier) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();

    -- 5. Fetch Context (History & Knowledge)
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

    -- 6. RETURN SUCCESS PACKAGE
    RETURN jsonb_build_object(
        'status', 'success',
        'governance', jsonb_build_object(
            'agente_encontrado', TRUE,
            'agente_ativo', TRUE,
            'empresa_ativa', TRUE,
            'limite_atingido', FALSE,
            'qnt_transacoes_correntes', v_active_conv_count,
            'max_concurrency', v_max_concurrency
        ),
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

GRANT EXECUTE ON FUNCTION n8n_orchestrator_v2(TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION n8n_orchestrator_v2(TEXT, TEXT, TEXT, JSONB) TO service_role;
