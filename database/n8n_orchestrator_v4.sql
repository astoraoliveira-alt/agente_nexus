-- =============================================
-- MASTER ORCHESTRATOR RPC v4.5 (Robust Superset)
-- Purpose: Extreme resilience for field naming (snake_case/camelCase)
-- Version: v4.5
-- =============================================

CREATE OR REPLACE FUNCTION n8n_orchestrator_v4(
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
    v_agent_name TEXT;
    v_agent_status VARCHAR;
    v_company_status VARCHAR;
    v_max_concurrency INT;
    v_active_conv_count INT;
    v_conversation_id UUID;
    v_reopened BOOLEAN := FALSE;
    v_agent_config JSONB;
    v_integration_config JSONB;
    v_messages JSONB;
    v_knowledge JSONB;
    v_lifecycle_stage VARCHAR;
    v_autonomy_level INT;
    v_context_window INT;
    v_applied_policies TEXT[];
    
    -- Policy Rules Aggregation
    v_governance_rules JSONB;
    v_found_policy_names TEXT[];
    
    -- Governance Flags
    v_agente_encontrado BOOLEAN := FALSE;
    v_agente_ativo BOOLEAN := FALSE;
    v_empresa_ativa BOOLEAN := FALSE;
    v_limite_atingido BOOLEAN := FALSE;
    v_clean_identifier TEXT;
BEGIN
    -- Sanitização: Remove o conteúdo do @ para frente
    v_clean_identifier := split_part(p_user_identifier, '@', 1);

    -- 1. Lookup Agent
    SELECT 
        id, tenant_id, name, status, max_concurrency, brain_config, 
        lifecycle_stage::VARCHAR, autonomy_level, context_window, 
        applied_policies, integration_config
    INTO 
        v_agent_id, v_tenant_id, v_agent_name, v_agent_status, v_max_concurrency, v_agent_config, 
        v_lifecycle_stage, v_autonomy_level, v_context_window, 
        v_applied_policies, v_integration_config
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

    -- 2. Validate for Execution (Strict)
    IF NOT v_agente_encontrado OR NOT v_agente_ativo OR NOT v_empresa_ativa OR v_limite_atingido THEN
        RETURN jsonb_build_object(
            'status', 'blocked',
            'governance', jsonb_build_object(
                'agente_encontrado', v_agente_encontrado,
                'agente_ativo', v_agente_ativo,
                'empresa_ativa', v_empresa_ativa,
                'limite_atingido', v_limite_atingido,
                'qnt_transacoes_correntes', COALESCE(v_active_conv_count, 0),
                'max_concurrency', COALESCE(v_max_concurrency, 0),
                'lifecycle_stage', v_lifecycle_stage,
                'autonomy_level', v_autonomy_level
            )
        );
    END IF;

    -- 3. Fetch Policies and Aggregate Rules
    IF v_applied_policies IS NOT NULL AND array_length(v_applied_policies, 1) > 0 THEN
        -- Get names of policies found
        SELECT array_agg(name) INTO v_found_policy_names
        FROM policies 
        WHERE tenant_id = v_tenant_id 
          AND is_active = TRUE 
          AND (id::TEXT = ANY(v_applied_policies) OR name = ANY(v_applied_policies));

        -- Aggregate rules carefully
        SELECT 
            jsonb_build_object(
                'canDo', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM policies p2, jsonb_array_elements_text(p2.rules->'canDo') r WHERE p2.tenant_id = v_tenant_id AND p2.is_active = TRUE AND (p2.id::TEXT = ANY(v_applied_policies) OR p2.name = ANY(v_applied_policies))), '[]'::jsonb),
                'cannotDo', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM policies p2, jsonb_array_elements_text(p2.rules->'cannotDo') r WHERE p2.tenant_id = v_tenant_id AND p2.is_active = TRUE AND (p2.id::TEXT = ANY(v_applied_policies) OR p2.name = ANY(v_applied_policies))), '[]'::jsonb),
                'transferConditions', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM policies p2, jsonb_array_elements_text(p2.rules->'transferConditions') r WHERE p2.tenant_id = v_tenant_id AND p2.is_active = TRUE AND (p2.id::TEXT = ANY(v_applied_policies) OR p2.name = ANY(v_applied_policies))), '[]'::jsonb)
            )
        INTO v_governance_rules;
    ELSE
        v_governance_rules := '{"canDo": [], "cannotDo": [], "transferConditions": []}'::jsonb;
        v_found_policy_names := ARRAY[]::TEXT[];
    END IF;

    -- 4. Get or Create Conversation
    SELECT id, status INTO v_conversation_id, v_agent_status
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

    -- 5. Sync Contact
    INSERT INTO contacts (tenant_id, identifier, name, channel)
    VALUES (v_tenant_id, v_clean_identifier, p_user_name, 'whatsapp')
    ON CONFLICT (tenant_id, identifier) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();

    -- 6. Context (Messages & Knowledge)
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

    -- 7. RETURN PACKAGE (Robust Mapping)
    RETURN jsonb_build_object(
        'status', 'success',
        'governance', jsonb_build_object(
            'agente_encontrado', TRUE,
            'agente_ativo', TRUE,
            'empresa_ativa', TRUE,
            'limite_atingido', FALSE,
            'qnt_transacoes_correntes', v_active_conv_count,
            'max_concurrency', v_max_concurrency,
            'lifecycle_stage', v_lifecycle_stage,
            'autonomy_level', v_autonomy_level,
            'applied_policies', COALESCE(v_found_policy_names, ARRAY[]::TEXT[]),
            'rules', COALESCE(v_governance_rules, '{"canDo": [], "cannotDo": [], "transferConditions": []}'::jsonb)
        ),
        'agent', jsonb_build_object(
            'id', v_agent_id,
            'name', v_agent_name,
            'tenantId', v_tenant_id,
            'lifecycle_stage', v_lifecycle_stage,
            'autonomy_level', v_autonomy_level,
            'systemPrompt', v_agent_config->>'systemPrompt',
            'userPromptTemplate', v_agent_config->>'userPromptTemplate',
            'modelId', v_agent_config->>'modelId',
            'temperature', (v_agent_config->>'temperature')::NUMERIC,
            'maxTokens', COALESCE((v_agent_config->>'maxTokens')::INT, (v_agent_config->>'max_tokens')::INT),
            'contextWindow', v_context_window,
            'responseMode', COALESCE(v_integration_config->>'responseMode', v_integration_config->>'response_mode')
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

GRANT EXECUTE ON FUNCTION n8n_orchestrator_v4(TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION n8n_orchestrator_v4(TEXT, TEXT, TEXT, JSONB) TO service_role;
