-- Davos Nexus - Orchestrator V5 with Dynamic Tools Support
-- Adds tool discovery from the agent_tools table.

DROP FUNCTION IF EXISTS n8n_orchestrator_v4(text, text, text, jsonb);

CREATE OR REPLACE FUNCTION n8n_orchestrator_v4(
    p_instance_name TEXT,
    p_user_identifier TEXT,
    p_user_name TEXT,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    -- State and Control Variables
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
    v_governance_rules JSONB;
    v_found_policy_names TEXT[];
    v_agente_encontrado BOOLEAN := FALSE;
    v_agente_ativo BOOLEAN := FALSE;
    v_empresa_ativa BOOLEAN := FALSE;
    v_limite_atingido BOOLEAN := FALSE;
    v_clean_identifier TEXT;
    v_security_session RECORD;
    v_system_prompt TEXT;
    v_identity_gate_enabled BOOLEAN;
    v_contact_status VARCHAR;
    v_tools JSONB;
    
    -- Security Layer with Intelligent Weights
    v_risk_score FLOAT := 0.0;
    v_user_banned BOOLEAN := FALSE;
BEGIN
    v_clean_identifier := split_part(p_user_identifier, '@', 1);

    -- 1. Agent Lookup
    SELECT id, tenant_id, name, status, max_concurrency, brain_config, 
           lifecycle_stage::VARCHAR, autonomy_level, context_window, 
           applied_policies, integration_config
    INTO v_agent_id, v_tenant_id, v_agent_name, v_agent_status, v_max_concurrency, 
         v_agent_config, v_lifecycle_stage, v_autonomy_level, v_context_window, 
         v_applied_policies, v_integration_config
    FROM agents WHERE evolution_instance = p_instance_name LIMIT 1;

    -- 2. Governance Validation
    IF v_agent_id IS NOT NULL THEN
        v_agente_encontrado := TRUE;
        v_agente_ativo := (v_agent_status = 'active');
        
        SELECT status INTO v_company_status FROM companies WHERE id = v_tenant_id;
        v_empresa_ativa := (v_company_status = 'active');
        
        SELECT COUNT(*) INTO v_active_conv_count FROM conversations WHERE agent_id = v_agent_id AND status = 'ai_active';
        v_limite_atingido := (v_active_conv_count >= v_max_concurrency);

        -- Check CRM/manual ban
        SELECT status INTO v_contact_status FROM contacts WHERE tenant_id = v_tenant_id AND identifier = v_clean_identifier;
        IF v_contact_status = 'banned' THEN
            v_user_banned := TRUE;
        END IF;
        
        -- DAVOS RISK SCORE SYSTEM
        SELECT COALESCE(SUM(CASE 
                WHEN i.severity::text = 'critical' THEN 3.0
                WHEN i.severity::text = 'high' THEN 1.0
                WHEN i.severity::text = 'medium' THEN 0.3
                ELSE 0.0
            END), 0.0)
        INTO v_risk_score
        FROM incidents i
        JOIN conversations c ON i.conversation_id = c.id
        WHERE c.user_identifier = v_clean_identifier
          AND c.tenant_id = v_tenant_id
          AND i.status = 'open' 
          AND i.created_at >= NOW() - INTERVAL '24 hours';
          
        IF v_risk_score >= 3.0 THEN
            v_user_banned := TRUE;
            UPDATE contacts SET status = 'banned', updated_at = NOW() WHERE tenant_id = v_tenant_id AND identifier = v_clean_identifier;
        ELSIF v_contact_status = 'banned' AND v_risk_score < 3.0 THEN
            UPDATE contacts SET status = 'active', updated_at = NOW() WHERE tenant_id = v_tenant_id AND identifier = v_clean_identifier;
            v_user_banned := FALSE;
        ELSIF v_contact_status IS NULL OR v_contact_status != 'banned' THEN
            INSERT INTO contacts (tenant_id, identifier, name, channel, status) 
            VALUES (v_tenant_id, v_clean_identifier, p_user_name, 'whatsapp', 'active') 
            ON CONFLICT (tenant_id, identifier) DO UPDATE SET name = COALESCE(EXCLUDED.name, contacts.name), updated_at = NOW();
        END IF;

        -- 2.1 Fetch Dynamic Tools
        SELECT jsonb_agg(tool_sub) INTO v_tools
        FROM (
            SELECT 
                id, name, description, parameters_schema,
                method, url, headers, is_active
            FROM agent_tools
            WHERE tenant_id = v_tenant_id
              AND (agent_id = v_agent_id OR agent_id IS NULL)
              AND is_active = TRUE
        ) tool_sub;
    END IF;

    -- Block return
    IF NOT v_agente_encontrado OR NOT v_agente_ativo OR NOT v_empresa_ativa OR v_limite_atingido OR v_user_banned THEN
        RETURN jsonb_build_object(
            'status', 'blocked', 
            'governance', jsonb_build_object(
                'agente_encontrado', v_agente_encontrado, 
                'agente_ativo', v_agente_ativo, 
                'empresa_ativa', v_empresa_ativa, 
                'limite_atingido', v_limite_atingido, 
                'user_banned', v_user_banned,
                'incident_count', v_risk_score, 
                'qnt_transacoes_correntes', COALESCE(v_active_conv_count, 0), 
                'max_concurrency', COALESCE(v_max_concurrency, 0), 
                'lifecycle_stage', v_lifecycle_stage, 
                'autonomy_level', v_autonomy_level
            )
        );
    END IF;

    -- 3. AI Policies
    IF v_applied_policies IS NOT NULL AND array_length(v_applied_policies, 1) > 0 THEN
        SELECT array_agg(name) INTO v_found_policy_names FROM policies WHERE tenant_id = v_tenant_id AND is_active = TRUE AND (id::TEXT = ANY(v_applied_policies) OR name = ANY(v_applied_policies));
        SELECT jsonb_build_object('canDo', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM policies p2, jsonb_array_elements_text(p2.rules->'canDo') r WHERE p2.tenant_id = v_tenant_id AND p2.is_active = TRUE AND (p2.id::TEXT = ANY(v_applied_policies) OR p2.name = ANY(v_applied_policies))), '[]'::jsonb), 'cannotDo', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM policies p2, jsonb_array_elements_text(p2.rules->'cannotDo') r WHERE p2.tenant_id = v_tenant_id AND p2.is_active = TRUE AND (p2.id::TEXT = ANY(v_applied_policies) OR p2.name = ANY(v_applied_policies))), '[]'::jsonb), 'transferConditions', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM policies p2, jsonb_array_elements_text(p2.rules->'transferConditions') r WHERE p2.tenant_id = v_tenant_id AND p2.is_active = TRUE AND (p2.id::TEXT = ANY(v_applied_policies) OR p2.name = ANY(v_applied_policies))), '[]'::jsonb)) INTO v_governance_rules;
    ELSE
        v_governance_rules := '{"canDo": [], "cannotDo": [], "transferConditions": []}'::jsonb;
        v_found_policy_names := ARRAY[]::TEXT[];
    END IF;

    -- 4. Conversation Management
    SELECT id, status INTO v_conversation_id, v_agent_status FROM conversations WHERE tenant_id = v_tenant_id AND agent_id = v_agent_id AND user_identifier = v_clean_identifier ORDER BY created_at DESC LIMIT 1;

    IF v_conversation_id IS NULL THEN
        INSERT INTO conversations (tenant_id, agent_id, user_identifier, user_name, channel, status, metadata) VALUES (v_tenant_id, v_agent_id, v_clean_identifier, p_user_name, 'whatsapp', 'ai_active', p_metadata) RETURNING id INTO v_conversation_id;
    ELSIF v_agent_status = 'closed' THEN
        UPDATE conversations SET status = 'ai_active', last_message_at = NOW(), user_name = p_user_name WHERE id = v_conversation_id;
        v_reopened := TRUE;
    ELSE
        UPDATE conversations SET last_message_at = NOW(), user_name = p_user_name WHERE id = v_conversation_id;
    END IF;

    -- 5. History and Knowledge RAG
    SELECT jsonb_agg(sub) INTO v_messages FROM (SELECT sender_type, content FROM (SELECT sender_type, content, created_at FROM messages WHERE conversation_id = v_conversation_id ORDER BY created_at DESC LIMIT v_context_window) last_history ORDER BY created_at ASC) sub;
    SELECT jsonb_agg(content) INTO v_knowledge FROM agent_knowledge WHERE agent_id = v_agent_id;

    -- 6. Identity Gate
    SELECT * INTO v_security_session FROM conversation_security_sessions WHERE conversation_id = v_conversation_id AND status = 'active' AND (expires_at IS NULL OR expires_at > now()) ORDER BY created_at DESC LIMIT 1;
    v_system_prompt := COALESCE(v_agent_config->>'systemPrompt', '');
    v_identity_gate_enabled := COALESCE((v_agent_config->'capabilities'->'identity_gate'->>'enabled')::boolean, false);

    IF v_security_session.id IS NOT NULL THEN
        v_system_prompt := v_system_prompt || E'\n\n[SISTEMA DE SEGURANÇA GATEKEEPER]: Autenticação CONCLUÍDA. CPF/CNPJ: ' || v_security_session.validated_identifier;
    ELSIF v_identity_gate_enabled THEN
        v_system_prompt := v_system_prompt || E'\n\n[SISTEMA DE SEGURANÇA GATEKEEPER]: REGRA: PROIBIDO pedir CPF agora.';
    END IF;

    -- 7. Final Payload
    RETURN jsonb_build_object(
        'status', 'success',
        'governance', jsonb_build_object(
            'agente_encontrado', TRUE, 'agente_ativo', TRUE, 'empresa_ativa', TRUE, 
            'limite_atingido', FALSE, 'user_banned', FALSE, 'risk_score', v_risk_score,
            'qnt_transacoes_correntes', v_active_conv_count, 'max_concurrency', v_max_concurrency, 
            'lifecycle_stage', v_lifecycle_stage, 'autonomy_level', v_autonomy_level,
            'applied_policies', COALESCE(v_found_policy_names, ARRAY[]::TEXT[]),
            'rules', v_governance_rules
        ),
        'agent', jsonb_build_object(
            'id', v_agent_id, 'name', v_agent_name, 'tenantId', v_tenant_id, 
            'greetingMessage', v_agent_config->>'greetingMessage', 'systemPrompt', v_system_prompt, 
            'userPromptTemplate', v_agent_config->>'userPromptTemplate', 'modelId', v_agent_config->>'modelId', 
            'temperature', (v_agent_config->>'temperature')::NUMERIC, 'contextWindow', v_context_window,
            'brain_config', v_agent_config,
            'tools', COALESCE(v_tools, '[]'::jsonb)
        ),
        'conversation', jsonb_build_object(
            'id', v_conversation_id, 'reopened', v_reopened, 
            'history', COALESCE(v_messages, '[]'::jsonb), 'knowledge', COALESCE(v_knowledge, '[]'::jsonb)
        )
    );
END;
$$;
