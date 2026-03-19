-- Correção de Estrutura de Retorno para n8n (Remapeamento Definitivo v7_4)
-- Agente PAI sempre na raiz.
-- Sub-agentes com suas próprias Tools aninhadas.
-- Lógica do Gatekeeper é deixada para o N8N Workflow resolver com base na security e em sub_agents.
-- CORREÇÃO: Lógica ajustada para a variável 'reopened' na gestão de conversas.

CREATE OR REPLACE FUNCTION public.n8n_orchestrator_v7(
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
    -- Dados do Agente Pai
    v_parent_agent_id UUID;
    v_tenant_id UUID;
    v_parent_requires_security BOOLEAN;
    
    -- Dados de Captura
    v_agent_name TEXT;
    v_agent_status VARCHAR;
    v_agent_config JSONB;
    v_context_window INT;
    v_lifecycle_stage VARCHAR;
    v_autonomy_level INT;
    v_whatsapp_api_type TEXT;
    v_meta_api_token TEXT;
    v_applied_policies TEXT[];
    
    -- Governança
    v_company_status VARCHAR;
    v_max_concurrency INT;
    v_active_conv_count INT;
    v_agente_encontrado BOOLEAN := FALSE;
    v_agente_ativo BOOLEAN := FALSE;
    v_empresa_ativa BOOLEAN := FALSE;
    v_limite_atingido BOOLEAN := FALSE;
    v_user_banned BOOLEAN := FALSE;
    v_contact_status VARCHAR;
    v_risk_score FLOAT := 0.0;
    v_governance_rules JSONB;
    
    -- Segurança
    v_session_status TEXT := 'unauthenticated';
    v_session_identifier TEXT := NULL;
    
    -- Conversa
    v_conversation_id UUID;
    v_clean_identifier TEXT;
    v_reopened BOOLEAN := FALSE;
    
    -- Arrays JSON
    v_sub_agents JSONB;
    v_tools JSONB;
BEGIN
    v_clean_identifier := split_part(p_user_identifier, '@', 1);

    -- 1. IDENTIFICA O AGENTE PAI SEMPRE (Dono da Instância)
    SELECT id, tenant_id, requires_security, max_concurrency
    INTO v_parent_agent_id, v_tenant_id, v_parent_requires_security, v_max_concurrency
    FROM public.agents 
    WHERE evolution_instance = p_instance_name LIMIT 1;

    IF v_parent_agent_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Agente não encontrado para esta instância.');
    END IF;

    -- 2. GESTÃO DE CONVERSA (Idêntico à v6 oficial)
    SELECT id INTO v_conversation_id FROM public.conversations 
    WHERE tenant_id = v_tenant_id AND agent_id = v_parent_agent_id AND user_identifier = v_clean_identifier AND status = 'ai_active'
    ORDER BY created_at DESC LIMIT 1;

    IF v_conversation_id IS NULL THEN
        -- Tenta encontrar conversa encerrada para reabrir
        SELECT id INTO v_conversation_id FROM public.conversations 
        WHERE tenant_id = v_tenant_id AND agent_id = v_parent_agent_id AND user_identifier = v_clean_identifier
        ORDER BY created_at DESC LIMIT 1;

        IF v_conversation_id IS NOT NULL THEN
            UPDATE public.conversations SET status = 'ai_active', updated_at = NOW() WHERE id = v_conversation_id;
            v_reopened := TRUE;
        ELSE
            -- Cria uma totalmente nova
            INSERT INTO public.conversations (tenant_id, agent_id, active_agent_id, user_identifier, user_name, channel, status, metadata) 
            VALUES (v_tenant_id, v_parent_agent_id, v_parent_agent_id, v_clean_identifier, p_user_name, 'whatsapp', 'ai_active', p_metadata) 
            RETURNING id INTO v_conversation_id;
        END IF;
    END IF;

    -- 3. VERIFICA SESSÃO DE SEGURANÇA ATIVA
    SELECT status, validated_identifier INTO v_session_status, v_session_identifier
    FROM public.conversation_security_sessions
    WHERE conversation_id = v_conversation_id
      AND status = 'active'
      AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1;

    -- 4. BUSCA DADOS DO AGENTE PAI NA RAIZ
    SELECT name, status, brain_config, lifecycle_stage::VARCHAR, autonomy_level, context_window, 
           whatsapp_api_type, meta_api_token, applied_policies
    INTO v_agent_name, v_agent_status, v_agent_config, v_lifecycle_stage, v_autonomy_level, v_context_window, 
         v_whatsapp_api_type, v_meta_api_token, v_applied_policies
    FROM public.agents 
    WHERE id = v_parent_agent_id;

    -- 5. BUSCA DE SUB-AGENTES (Com SUAS próprias Tools e Prompts aninhados)
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', a.id,
            'name', a.name,
            'role', a.role,
            'status', a.status,
            'is_gatekeeper', a.is_gatekeeper,
            'modelId', a.brain_config->>'modelId',
            'systemPrompt', a.brain_config->>'systemPrompt',
            'temperature', (a.brain_config->>'temperature')::NUMERIC,
            'tools', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'name', t.name, 
                        'description', t.description, 
                        'parameters', t.parameters_schema, 
                        'method', t.method, 
                        'url', t.url, 
                        'headers', t.headers, 
                        'category', t.category
                    )
                ), '[]'::jsonb)
                FROM public.agent_tools t
                WHERE t.tenant_id = a.tenant_id AND t.agent_id = a.id AND t.is_active = TRUE
            )
        )
    ) INTO v_sub_agents 
    FROM public.agents a 
    WHERE a.parent_agent_id = v_parent_agent_id;

    -- 6. VALIDAÇÕES DE GOVERNANÇA E EMPRESA
    v_agente_encontrado := (v_parent_agent_id IS NOT NULL);
    v_agente_ativo := (v_agent_status = 'active');
    
    SELECT status INTO v_company_status FROM public.companies WHERE id = v_tenant_id;
    v_empresa_ativa := (v_company_status = 'active');

    SELECT COUNT(*) INTO v_active_conv_count FROM public.conversations 
    WHERE agent_id = v_parent_agent_id AND status = 'ai_active';
    v_limite_atingido := (v_active_conv_count > v_max_concurrency);

    SELECT status INTO v_contact_status FROM public.contacts WHERE tenant_id = v_tenant_id AND identifier = v_clean_identifier;
    v_user_banned := (v_contact_status = 'banned');

    SELECT COALESCE(SUM(CASE 
            WHEN i.severity::text = 'critical' THEN 3.0
            WHEN i.severity::text = 'high' THEN 1.0
            ELSE 0.3 END), 0.0) INTO v_risk_score
    FROM public.incidents i JOIN public.conversations c ON i.conversation_id = c.id
    WHERE c.user_identifier = v_clean_identifier AND i.status = 'open' AND i.created_at >= NOW() - INTERVAL '24 hours';
    
    IF v_applied_policies IS NOT NULL AND array_length(v_applied_policies, 1) > 0 THEN
        SELECT jsonb_build_object(
            'canDo', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM public.policies p2, jsonb_array_elements_text(p2.rules->'canDo') r WHERE p2.tenant_id = v_tenant_id AND p2.is_active = TRUE AND (p2.id::TEXT = ANY(v_applied_policies) OR p2.name = ANY(v_applied_policies))), '[]'::jsonb),
            'cannotDo', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM public.policies p2, jsonb_array_elements_text(p2.rules->'cannotDo') r WHERE p2.tenant_id = v_tenant_id AND p2.is_active = TRUE AND (p2.id::TEXT = ANY(v_applied_policies) OR p2.name = ANY(v_applied_policies))), '[]'::jsonb),
            'transferConditions', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM public.policies p2, jsonb_array_elements_text(p2.rules->'transferConditions') r WHERE p2.tenant_id = v_tenant_id AND p2.is_active = TRUE AND (p2.id::TEXT = ANY(v_applied_policies) OR p2.name = ANY(v_applied_policies))), '[]'::jsonb)
        ) INTO v_governance_rules;
    ELSE
        v_governance_rules := '{"canDo": [], "cannotDo": [], "transferConditions": []}'::jsonb;
    END IF;

    -- 7. BUSCA DE FERRAMENTAS EXCLUSIVAS DO PAI (Ou gerais)
    SELECT jsonb_agg(tool_sub) INTO v_tools FROM (
        SELECT name, description, parameters_schema as parameters, method, url, headers, category
        FROM public.agent_tools
        WHERE tenant_id = v_tenant_id AND (agent_id = v_parent_agent_id OR agent_id IS NULL) AND is_active = TRUE
    ) tool_sub;

    -- 8. RETORNO CONSOLIDADO
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
            'id', v_parent_agent_id,
            'name', v_agent_name,
            'role', 'conversational',
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
            'sub_agents', COALESCE(v_sub_agents, '[]'::jsonb),
            'tools', COALESCE(v_tools, '[]'::jsonb)
        ),
        'conversation', jsonb_build_object(
            'id', v_conversation_id,
            'reopened', v_reopened
        ),
        'security', jsonb_build_object(
            'session_status', COALESCE(v_session_status, 'unauthenticated'),
            'session_identifier', v_session_identifier,
            'requires_auth', v_parent_requires_security
        )
    );
END;
$$;
