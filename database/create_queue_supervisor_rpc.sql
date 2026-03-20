-- =============================================== --
-- DAVOS NEXUS - SUPERVISOR DE FILA (O MAESTRO) --
-- Versão 4.1 - Sincronia de IDs & Governance Fix --
-- =============================================== --

-- 1. FUNÇÃO DE CONTEXTO ELITE V7 (ORQUESTRADOR COMPLETO)
CREATE OR REPLACE FUNCTION public.fn_get_agent_context(
    p_agent_id uuid,
    p_user_identifier varchar,
    p_user_name varchar,
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_conversation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
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
    v_tenant_id UUID;
    v_requires_security BOOLEAN;
    
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
    v_conversation_id := p_conversation_id;

    -- 1. BUSCA DADOS DO AGENTE (Pai/Principal)
    SELECT name, status, brain_config, lifecycle_stage::VARCHAR, autonomy_level, context_window, 
           whatsapp_api_type, meta_api_token, applied_policies, tenant_id, requires_security, max_concurrency
    INTO v_agent_name, v_agent_status, v_agent_config, v_lifecycle_stage, v_autonomy_level, v_context_window, 
         v_whatsapp_api_type, v_meta_api_token, v_applied_policies, v_tenant_id, v_requires_security, v_max_concurrency
    FROM public.agents 
    WHERE id = p_agent_id;

    IF p_agent_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Agente não encontrado.');
    END IF;

    -- 2. GESTÃO DE CONVERSA (Status Inteligente)
    -- Se não recebemos um ID da fila, tentamos localizar um ativo
    IF v_conversation_id IS NULL THEN
        SELECT id INTO v_conversation_id FROM public.conversations 
        WHERE tenant_id = v_tenant_id AND agent_id = p_agent_id AND user_identifier = v_clean_identifier AND status = 'ai_active'
        ORDER BY created_at DESC LIMIT 1;
    END IF;

    IF v_conversation_id IS NULL THEN
        SELECT id INTO v_conversation_id FROM public.conversations 
        WHERE tenant_id = v_tenant_id AND agent_id = p_agent_id AND user_identifier = v_clean_identifier
        ORDER BY created_at DESC LIMIT 1;

        IF v_conversation_id IS NOT NULL THEN
            UPDATE public.conversations SET status = 'ai_active' WHERE id = v_conversation_id;
            v_reopened := TRUE;
        ELSE
            INSERT INTO public.conversations (tenant_id, agent_id, active_agent_id, user_identifier, user_name, channel, status, metadata) 
            VALUES (v_tenant_id, p_agent_id, p_agent_id, v_clean_identifier, p_user_name, 'whatsapp', 'ai_active', p_metadata) 
            RETURNING id INTO v_conversation_id;
        END IF;
    END IF;

    -- 3. VERIFICA SESSÃO DE SEGURANÇA
    SELECT status, validated_identifier INTO v_session_status, v_session_identifier
    FROM public.conversation_security_sessions
    WHERE conversation_id = v_conversation_id AND status = 'active' AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1;

    -- 4. BUSCA DE SUB-AGENTES E FERRAMENTAS
    SELECT jsonb_agg(sub) INTO v_sub_agents FROM (
        SELECT a.id, a.name, a.role, a.status, a.is_gatekeeper,
               a.brain_config->>'modelId' as "modelId", a.brain_config->>'systemPrompt' as "systemPrompt",
               (a.brain_config->>'temperature')::NUMERIC as temperature,
               (SELECT COALESCE(jsonb_agg(t_sub), '[]'::jsonb) FROM (
                   SELECT name, description, parameters_schema as parameters, method, url, headers, category, body_mapping, query_params
                   FROM public.agent_tools t WHERE t.tenant_id = a.tenant_id AND t.agent_id = a.id AND t.is_active = TRUE
               ) t_sub) as tools
        FROM public.agents a WHERE a.parent_agent_id = p_agent_id
    ) sub;

    -- 5. VALIDAÇÕES DE GOVERNANÇA
    v_agente_encontrado := TRUE;
    v_agente_ativo := (v_agent_status = 'active');
    
    SELECT status INTO v_company_status FROM public.companies WHERE id = v_tenant_id;
    v_empresa_ativa := (v_company_status = 'active');

    SELECT COUNT(*) INTO v_active_conv_count FROM public.conversations WHERE agent_id = p_agent_id AND status = 'ai_active';
    v_limite_atingido := (v_active_conv_count > v_max_concurrency);

    -- Ajuste de Ban: Garantir booleano
    SELECT (status = 'banned') INTO v_user_banned FROM public.contacts 
    WHERE tenant_id = v_tenant_id AND identifier = v_clean_identifier;
    v_user_banned := COALESCE(v_user_banned, false);

    SELECT COALESCE(SUM(CASE WHEN i.severity::text = 'critical' THEN 3.0 WHEN i.severity::text = 'high' THEN 1.0 ELSE 0.3 END), 0.0) INTO v_risk_score
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

    SELECT jsonb_agg(tool_sub) INTO v_tools FROM (
        SELECT name, description, parameters_schema as parameters, method, url, headers, category, body_mapping, query_params
        FROM public.agent_tools WHERE tenant_id = v_tenant_id AND (agent_id = p_agent_id OR agent_id IS NULL) AND is_active = TRUE
    ) tool_sub;

    -- 6. RETORNO CONSOLIDADO V7
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
            'id', p_agent_id,
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
            'requires_auth', v_requires_security
        )
    );
END;
$$;

-- 2. O SUPERVISOR (O MAESTRO)
CREATE OR REPLACE FUNCTION public.fn_fetch_next_inbound_message()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_record record;
    v_context jsonb;
BEGIN
    UPDATE public.inbound_queue q SET status = 'processing', locked_at = NOW(), queue_time = NOW() - q.created_at
    WHERE q.id = (
      SELECT q1.id FROM public.inbound_queue q1 WHERE q1.status IN ('pending', 'failed') AND (q1.next_retry_at IS NULL OR q1.next_retry_at <= NOW())
      AND NOT EXISTS (SELECT 1 FROM public.inbound_queue q2 WHERE q2.conversation_id = q1.conversation_id AND q2.status = 'processing')
      AND q1.sequence_number = (SELECT MIN(sequence_number) FROM public.inbound_queue q3 WHERE q3.conversation_id = q1.conversation_id AND q3.status IN ('pending', 'failed'))
      ORDER BY priority DESC, sequence_number ASC, created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
    ) RETURNING * INTO v_record;

    IF v_record.id IS NULL THEN return NULL; END IF;

    -- Sincronia de ID: Passamos o conversation_id da fila para o contexto
    SELECT public.fn_get_agent_context(
        v_record.agent_id, 
        (v_record.payload->>'phone')::varchar, 
        (v_record.payload->>'name')::varchar, 
        COALESCE(v_record.payload->'metadata', '{}'::jsonb),
        v_record.conversation_id -- <--- Sincronia aqui!
    ) INTO v_context;

    UPDATE public.inbound_queue SET context = v_context WHERE id = v_record.id;

    RETURN jsonb_build_object('queue_id', v_record.id, 'tenant_id', v_record.tenant_id, 'agent_id', v_record.agent_id, 'conversation_id', v_record.conversation_id, 'sequence_number', v_record.sequence_number, 'payload', v_record.payload, 'context', v_context, 'metrics', jsonb_build_object('queue_time_seconds', EXTRACT(EPOCH FROM (NOW() - v_record.created_at))));
END;
$$;
