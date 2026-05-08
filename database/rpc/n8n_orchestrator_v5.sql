-- ============================================================================
-- NEXUS HUB: N8N ORCHESTRATOR V5 (DROP-IN COMPATIBLE VERSION)
-- Objetivo: Compatibilidade total com nós JS e LLMs existentes,
--           adicionando suporte a Meta Token e Hierarquia.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.n8n_orchestrator_v5(
    p_instance_name TEXT,
    p_user_identifier TEXT,
    p_user_name TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    -- Dados do Agente e Tenant
    v_agent_id UUID;
    v_tenant_id UUID;
    v_agent_name TEXT;
    v_agent_status VARCHAR;
    v_company_status VARCHAR;
    v_max_concurrency INT;
    v_active_conv_count INT;
    v_agent_config JSONB;
    v_context_window INT;
    v_lifecycle_stage VARCHAR;
    v_autonomy_level INT;
    v_whatsapp_api_type TEXT;
    v_meta_api_token TEXT;
    v_applied_policies TEXT[];
    
    -- Governança e Decisões
    v_agente_encontrado BOOLEAN := FALSE;
    v_agente_ativo BOOLEAN := FALSE;
    v_empresa_ativa BOOLEAN := FALSE;
    v_limite_atingido BOOLEAN := FALSE;
    v_user_banned BOOLEAN := FALSE;
    v_contact_status VARCHAR;
    v_risk_score FLOAT := 0.0;
    v_governance_rules JSONB;
    
    -- Segurança (Session)
    v_security_session_status TEXT := 'unauthenticated';
    v_security_identifier TEXT := NULL;
    
    -- Conversa e História
    v_conversation_id UUID;
    v_clean_identifier TEXT;
    v_messages JSONB;
    v_reopened BOOLEAN := FALSE;
    
    -- Sub-agentes
    v_sub_agents JSONB;
BEGIN
    v_clean_identifier := split_part(p_user_identifier, '@', 1);

    -- 1. BUSCA CONSOLIDADA DO AGENTE
    SELECT id, tenant_id, name, status, max_concurrency, brain_config, 
           lifecycle_stage::VARCHAR, autonomy_level, context_window, 
           whatsapp_api_type, meta_api_token, applied_policies
    INTO v_agent_id, v_tenant_id, v_agent_name, v_agent_status, v_max_concurrency, 
         v_agent_config, v_lifecycle_stage, v_autonomy_level, v_context_window, 
         v_whatsapp_api_type, v_meta_api_token, v_applied_policies
    FROM public.agents 
    WHERE evolution_instance = p_instance_name LIMIT 1;

    -- 2. VALIDAÇÕES DE GOVERNANÇA E EMPRESA
    IF v_agent_id IS NOT NULL THEN
        v_agente_encontrado := TRUE;
        v_agente_ativo := (v_agent_status = 'active');
        
        SELECT status INTO v_company_status FROM public.companies WHERE id = v_tenant_id;
        v_empresa_ativa := (v_company_status = 'active');

        SELECT COUNT(*) INTO v_active_conv_count FROM public.conversations 
        WHERE agent_id = v_agent_id AND status = 'ai_active';
        v_limite_atingido := (v_active_conv_count >= v_max_concurrency);

        -- Risco e Banimento (Lógica baseada na V4)
        SELECT status INTO v_contact_status FROM public.contacts 
        WHERE tenant_id = v_tenant_id AND identifier = v_clean_identifier;
        v_user_banned := (v_contact_status = 'banned');

        -- Cálculo de Risco simplificado para performance
        SELECT COALESCE(SUM(CASE 
                WHEN i.severity::text = 'critical' THEN 3.0
                WHEN i.severity::text = 'high' THEN 1.0
                ELSE 0.3 END), 0.0) INTO v_risk_score
        FROM public.incidents i JOIN public.conversations c ON i.conversation_id = c.id
        WHERE c.user_identifier = v_clean_identifier AND i.status = 'open' AND i.created_at >= NOW() - INTERVAL '24 hours';
        
        -- Busca de Políticas (Essencial para os nós JS do n8n)
        IF v_applied_policies IS NOT NULL AND array_length(v_applied_policies, 1) > 0 THEN
            SELECT jsonb_build_object(
                'canDo', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM public.policies p2, jsonb_array_elements_text(p2.rules->'canDo') r WHERE p2.tenant_id = v_tenant_id AND p2.is_active = TRUE AND (p2.id::TEXT = ANY(v_applied_policies) OR p2.name = ANY(v_applied_policies))), '[]'::jsonb),
                'cannotDo', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM public.policies p2, jsonb_array_elements_text(p2.rules->'cannotDo') r WHERE p2.tenant_id = v_tenant_id AND p2.is_active = TRUE AND (p2.id::TEXT = ANY(v_applied_policies) OR p2.name = ANY(v_applied_policies))), '[]'::jsonb),
                'transferConditions', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM public.policies p2, jsonb_array_elements_text(p2.rules->'transferConditions') r WHERE p2.tenant_id = v_tenant_id AND p2.is_active = TRUE AND (p2.id::TEXT = ANY(v_applied_policies) OR p2.name = ANY(v_applied_policies))), '[]'::jsonb)
            ) INTO v_governance_rules;
        ELSE
            v_governance_rules := '{"canDo": [], "cannotDo": [], "transferConditions": []}'::jsonb;
        END IF;
    END IF;

    -- 3. GESTÃO DE CONVERSA
    IF v_agente_encontrado THEN
        SELECT id, status INTO v_conversation_id, v_agent_status FROM public.conversations 
        WHERE tenant_id = v_tenant_id AND agent_id = v_agent_id AND user_identifier = v_clean_identifier 
        ORDER BY created_at DESC LIMIT 1;

        IF v_conversation_id IS NULL THEN
            INSERT INTO public.conversations (tenant_id, agent_id, user_identifier, user_name, channel, status, metadata) 
            VALUES (v_tenant_id, v_agent_id, v_clean_identifier, p_user_name, 'whatsapp', 'ai_active', p_metadata) 
            RETURNING id INTO v_conversation_id;
        ELSIF v_agent_status = 'closed' THEN
            UPDATE public.conversations SET status = 'ai_active', last_message_at = NOW() WHERE id = v_conversation_id;
            v_reopened := TRUE;
        ELSE
            UPDATE public.conversations SET last_message_at = NOW() WHERE id = v_conversation_id;
        END IF;
    END IF;

    -- 4. SEGURANÇA E SUB-AGENTES
    IF v_conversation_id IS NOT NULL THEN
        -- Expirar sessões que passaram do prazo (limpeza proativa)
        UPDATE public.conversation_security_sessions
        SET status = 'expired', updated_at = NOW()
        WHERE conversation_id = v_conversation_id
          AND status = 'active'
          AND expires_at < NOW();

        -- Buscar sessão ativa E dentro do prazo de validade
        SELECT status, validated_identifier INTO v_security_session_status, v_security_identifier
        FROM public.conversation_security_sessions
        WHERE conversation_id = v_conversation_id
          AND status = 'active'
          AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1;
    END IF;

    IF v_agent_id IS NOT NULL THEN
        SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role,'status',status)) INTO v_sub_agents 
        FROM public.agents WHERE parent_agent_id = v_agent_id;
    END IF;

    -- 5. RETORNO COMPATÍVEL (Drop-in Replacement para v4)
    RETURN jsonb_build_object(
        'status', CASE WHEN NOT v_agente_encontrado OR NOT v_agente_ativo OR NOT v_empresa_ativa OR v_limite_atingido OR v_user_banned THEN 'blocked' ELSE 'success' END,
        'governance', jsonb_build_object(
            'agente_encontrado', v_agente_encontrado,
            'agente_ativo', v_agente_ativo,
            'empresa_ativa', v_empresa_ativa,
            'limite_atingido', v_limite_atingido,
            'user_banned', v_user_banned,
            'risk_score', v_risk_score,
            'qnt_transacoes_correntes', v_active_conv_count,
            'max_concurrency', v_max_concurrency,
            'lifecycle_stage', v_lifecycle_stage,
            'autonomy_level', v_autonomy_level,
            'rules', v_governance_rules
        ),
        'agent', jsonb_build_object(
            'id', v_agent_id,
            'name', v_agent_name,
            'tenantId', v_tenant_id,
            'greetingMessage', v_agent_config->>'greetingMessage',
            'systemPrompt', v_agent_config->>'systemPrompt',
            'userPromptTemplate', v_agent_config->>'userPromptTemplate',
            'modelId', v_agent_config->>'modelId',
            'temperature', (v_agent_config->>'temperature')::NUMERIC,
            'contextWindow', v_context_window,
            'brain_config', v_agent_config,
            'whatsapp_api_type', v_whatsapp_api_type,
            'meta_api_token', v_meta_api_token,
            'sub_agents', COALESCE(v_sub_agents, '[]'::jsonb)
        ),
        'conversation', jsonb_build_object(
            'id', v_conversation_id,
            'status', v_agent_status,
            'reopened', v_reopened
        ),
        'security', jsonb_build_object( -- Bloco extra para o novo Gatekeeper opcional
            'session_status', COALESCE(v_security_session_status, 'unauthenticated'),
            'session_identifier', v_security_identifier,
            'requires_auth', COALESCE((v_agent_config->'capabilities'->'identity_gate'->>'enabled')::boolean, false)
        )
    );
END;
$$;
