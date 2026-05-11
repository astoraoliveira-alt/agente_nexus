-- Migração: Atualização de RPCs de Produção (V66.9 - RESTAURAÇÃO TOTAL)
-- Objetivo: Restaurar 100% dos campos de produção e injetar melhorias de performance.

-- 🛡️ PROTEÇÃO: Limpar sobrecargas da função
DROP FUNCTION IF EXISTS public.fn_fetch_next_inbound_message(integer, text);

CREATE OR REPLACE FUNCTION public.fn_fetch_next_inbound_message(
    p_lock_minutes INT DEFAULT 5,
    p_n8n_execution_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_record RECORD;
    v_agent RECORD;
    v_conv RECORD;
    v_lead RECORD;
    v_sub_agents JSONB;
    v_tools JSONB;
    v_governance_rules JSONB;
    v_phone_clean TEXT;
    v_company_status VARCHAR;
    v_contact_status VARCHAR;
    v_active_conv_count INT;
    v_session_status TEXT := 'unauthenticated';
    v_session_identifier TEXT := NULL;
    v_history JSONB;
    v_retorno JSONB;
    v_was_closed BOOLEAN DEFAULT FALSE;
    v_summary TEXT;
    v_active_incidents JSONB := '[]'::jsonb;

    v_mod_brain_config JSONB;
    v_temp_sys_prompt TEXT;
    v_temp_user_prompt TEXT;
BEGIN
    -- [1] Busca Mensagem na Fila (Com Skip Locked para Performance)
    UPDATE public.inbound_queue
    SET
        status = 'assigned',
        locked_at = NOW(),
        n8n_execution_id = COALESCE(p_n8n_execution_id, n8n_execution_id)
    WHERE id = (
        SELECT id
        FROM public.inbound_queue
        WHERE status = 'pending'
        ORDER BY priority DESC NULLS LAST, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING * INTO v_record;

    IF v_record.id IS NULL THEN
        RETURN NULL;
    END IF;

    -- [2] Contexto e Telefone (Zenvia/Evolution Match)
    v_phone_clean := regexp_replace(split_part(COALESCE(v_record.payload->>'phone', v_record.payload->>'from'), '@', 1), '\D', '', 'g');

    SELECT * INTO v_agent FROM public.agents WHERE id = v_record.agent_id;
    SELECT * INTO v_conv FROM public.conversations WHERE id = v_record.conversation_id;

    -- [3] Reabertura Automática de Conversas
    IF v_conv.id IS NOT NULL AND v_conv.status = 'closed' THEN
        v_was_closed := TRUE;
        UPDATE public.conversations
        SET status = 'ai_active',
            context_state = '{}'::jsonb,
            reopened_at = NOW(),
            updated_at = NOW()
        WHERE id = v_conv.id
        RETURNING * INTO v_conv;
    END IF;

    -- [4] Busca de Lead e Injeção de Variáveis {{LEAD_NAME}}
    SELECT * INTO v_lead FROM public.agent_leads
    WHERE tenant_id = v_agent.tenant_id
      AND (whatsapp = RIGHT(v_phone_clean, 11) OR whatsapp = RIGHT(v_phone_clean, 10) OR whatsapp = v_phone_clean OR identifier = v_phone_clean)
    ORDER BY created_at DESC LIMIT 1;

    v_mod_brain_config := v_agent.brain_config;
    v_temp_sys_prompt  := v_mod_brain_config->>'systemPrompt';
    v_temp_user_prompt := v_mod_brain_config->>'userPromptTemplate';

    IF v_temp_sys_prompt IS NOT NULL THEN
        v_temp_sys_prompt := replace(v_temp_sys_prompt, '{{LEAD_NAME}}', COALESCE(trim(v_lead.name), v_record.payload->>'name', 'Cliente'));
        v_temp_sys_prompt := replace(v_temp_sys_prompt, '{{LEAD_CNPJ}}', COALESCE(trim(v_lead.identifier), ''));
        v_mod_brain_config := jsonb_set(v_mod_brain_config, '{systemPrompt}', to_jsonb(v_temp_sys_prompt));
    END IF;

    IF v_temp_user_prompt IS NOT NULL THEN
        v_temp_user_prompt := replace(v_temp_user_prompt, '{{LEAD_NAME}}', COALESCE(trim(v_lead.name), v_record.payload->>'name', 'Cliente'));
        v_temp_user_prompt := replace(v_temp_user_prompt, '{{LEAD_CNPJ}}', COALESCE(trim(v_lead.identifier), ''));
        v_mod_brain_config := jsonb_set(v_mod_brain_config, '{userPromptTemplate}', to_jsonb(v_temp_user_prompt));
    END IF;

    -- [5] Histórico com Sliding Window (Injeção de Resumo)
    v_summary := v_conv.metadata->>'summary';
    
    SELECT jsonb_agg(h) INTO v_history
    FROM (
        SELECT 'system' as sender_type, 'Resumo das conversas anteriores: ' || v_summary as content, COALESCE(v_conv.created_at, NOW()) as created_at
        WHERE v_summary IS NOT NULL
        UNION ALL
        SELECT sender_type, content, created_at
        FROM (
            SELECT sender_type, content, created_at
            FROM public.messages
            WHERE conversation_id = v_record.conversation_id
              AND (v_conv.reopened_at IS NULL OR created_at >= v_conv.reopened_at)
            ORDER BY created_at DESC
            LIMIT COALESCE(v_agent.context_window, 10)
        ) sub
        ORDER BY created_at ASC
    ) h;

    -- [6] Sub-Agentes, Ferramentas e Segurança
    SELECT jsonb_agg(sub) INTO v_sub_agents FROM (
        SELECT a.id, a.name, a.role, a.status, a.is_gatekeeper,
               a.brain_config->>'modelId' AS model_id,
               a.brain_config->>'systemPrompt' AS system_prompt,
               (a.brain_config->>'temperature')::numeric AS temperature,
               (SELECT COALESCE(jsonb_agg(t_item), '[]'::jsonb) FROM (SELECT name, description, parameters_schema AS parameters, method, url, headers, category FROM public.agent_tools t WHERE t.agent_id = a.id AND t.is_active = TRUE) t_item) AS tools
        FROM public.agents a WHERE a.parent_agent_id = v_record.agent_id
    ) sub;

    SELECT jsonb_agg(t_row) INTO v_tools FROM (
        SELECT name, description, parameters_schema AS parameters, method, url, headers, category
        FROM public.agent_tools WHERE tenant_id = v_agent.tenant_id AND (agent_id = v_record.agent_id OR agent_id IS NULL) AND is_active = TRUE
    ) t_row;

    -- [7] Governança e Políticas de Produção
    SELECT status INTO v_company_status FROM public.companies WHERE id = v_agent.tenant_id;
    SELECT COUNT(*) INTO v_active_conv_count FROM public.conversations WHERE agent_id = v_record.agent_id AND status = 'ai_active';
    SELECT status INTO v_contact_status FROM public.contacts WHERE tenant_id = v_agent.tenant_id AND identifier = v_phone_clean LIMIT 1;
    
    SELECT status, validated_identifier INTO v_session_status, v_session_identifier
    FROM public.conversation_security_sessions
    WHERE conversation_id = v_record.conversation_id AND status = 'active' AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1;

    -- 🔥 Injeção de Incidentes Ativos
    BEGIN
        SELECT jsonb_agg(inc) INTO v_active_incidents FROM (
            SELECT id, campaign_id, title, response_message, mode FROM public.system_incidents 
            WHERE tenant_id = v_agent.tenant_id AND status = 'active'
        ) inc;
    EXCEPTION WHEN OTHERS THEN v_active_incidents := '[]'::jsonb;
    END;

    IF v_agent.applied_policies IS NOT NULL AND array_length(v_agent.applied_policies, 1) > 0 THEN
        v_governance_rules := jsonb_build_object(
            'canDo', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM public.policies p2, jsonb_array_elements_text(p2.rules->'canDo') r WHERE (p2.id::TEXT = ANY(v_agent.applied_policies)) AND p2.is_active = TRUE), '[]'::jsonb),
            'cannotDo', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM public.policies p2, jsonb_array_elements_text(p2.rules->'cannotDo') r WHERE (p2.id::TEXT = ANY(v_agent.applied_policies)) AND p2.is_active = TRUE), '[]'::jsonb),
            'transferConditions', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM public.policies p2, jsonb_array_elements_text(p2.rules->'transferConditions') r WHERE (p2.id::TEXT = ANY(v_agent.applied_policies)) AND p2.is_active = TRUE), '[]'::jsonb)
        );
    ELSE
        v_governance_rules := '{"canDo": [], "cannotDo": [], "transferConditions": []}'::jsonb;
    END IF;

    -- [8] Montagem do Retorno (100% FIELD MATCH COM v3)
    v_retorno := jsonb_build_object(
        'status', 'success',
        'status_rpc', 'success',
        'id', v_record.id,
        'queue_id', v_record.id,
        'trace_id', v_record.trace_id,
        'n8n_execution_id', v_record.n8n_execution_id,
        'tenant_id', v_record.tenant_id,
        'agent_id', v_record.agent_id,
        'session_id', v_record.conversation_id,
        'message', COALESCE(v_record.payload->>'content', v_record.payload->>'text', ''),
        'messages_history', COALESCE(v_history, '[]'::jsonb),
        'message_type', COALESCE(v_record.message_type, 'conversation'),
        'is_ai', true,
        'atendimento_tipo', 'IA',
        'is_status_update', (v_record.message_type LIKE 'outbound_%'),
        'external_id', v_record.external_id,
        'raw_payload', v_record.payload,

        'agent', jsonb_build_object(
            'id', v_agent.id,
            'name', v_agent.name,
            'role', COALESCE(v_agent.role, 'Consultor de Vendas'),
            'meta_api_token', v_agent.meta_api_token,
            'meta_phone_number_id', v_agent.meta_phone_number_id,
            'meta_waba_id', v_agent.meta_waba_id,
            'meta_verify_token', v_agent.meta_verify_token,
            'whatsapp_api_type', v_agent.whatsapp_api_type,
            'whatsapp_provider', COALESCE(v_agent.whatsapp_provider, 'evolution'),
            'zenvia_channel_id', v_agent.zenvia_channel_id,
            'zenvia_api_token', v_agent.zenvia_api_token,
            'contextWindow', v_agent.context_window,
            'brain_config', v_mod_brain_config,
            'greeting_message', COALESCE(v_mod_brain_config->>'greetingMessage', ''),
            'sub_agents', COALESCE(v_sub_agents, '[]'::jsonb),
            'tools', COALESCE(v_tools, '[]'::jsonb),
            'workflow_blueprint', v_agent.workflow_blueprint,
            'active_incidents', COALESCE(v_active_incidents, '[]'::jsonb)
        ),

        'lead_info', jsonb_build_object(
            'is_lead', (v_lead.id IS NOT NULL),
            'name', COALESCE(v_lead.name, v_record.payload->>'name', 'Usuário'),
            'link', COALESCE(v_lead.cta_link, ''),
            'cnpj', COALESCE(v_lead.identifier, ''),
            'campaign_id', v_lead.campaign_id
        ),

        'conversation', jsonb_build_object(
            'id', v_record.conversation_id,
            'status', COALESCE(v_conv.status, 'ai_active'),
            'context_state', COALESCE(v_conv.context_state, '{}'::jsonb),
            'reopened', v_was_closed
        ),

        'governance', jsonb_build_object(
            'agente_encontrado', TRUE,
            'agente_ativo', (v_agent.status = 'active'),
            'empresa_ativa', (v_company_status = 'active'),
            'limite_atingido', (v_active_conv_count > v_agent.max_concurrency),
            'user_banned', (v_contact_status = 'banned'),
            'qnt_transacoes_correntes', v_active_conv_count,
            'max_concurrency', v_agent.max_concurrency,
            'lifecycle_stage', v_agent.lifecycle_stage,
            'autonomy_level', v_agent.autonomy_level,
            'rules', v_governance_rules
        ),

        'security', jsonb_build_object(
            'session_status', COALESCE(v_session_status, 'unauthenticated'),
            'session_identifier', v_session_identifier,
            'requires_auth', COALESCE(v_agent.requires_security, false)
        ),

        'payload', jsonb_build_object(
            'name', COALESCE(v_record.payload->>'name', 'Usuário'),
            'phone', v_phone_clean,
            'content', COALESCE(v_record.payload->>'content', ''),
            'instance', COALESCE(v_agent.evolution_instance, 'evolution'),
            'platform', COALESCE(v_record.payload->>'platform', 'whatsapp'),
            'remoteID', COALESCE(v_record.payload->>'id', v_record.payload->>'messageId', v_record.payload->>'remoteID', '')
        ),

        -- ESPELHOS NA RAIZ PARA COMPATIBILIDADE n8n
        'zenvia_api_token', v_agent.zenvia_api_token,
        'zenvia_channel_id', v_agent.zenvia_channel_id,
        'meta_api_token', v_agent.meta_api_token,
        'meta_phone_number_id', v_agent.meta_phone_number_id,
        'whatsapp_provider', COALESCE(v_agent.whatsapp_provider, v_agent.whatsapp_api_type)
    );

    UPDATE public.inbound_queue SET context = v_retorno WHERE id = v_record.id;
    RETURN v_retorno || jsonb_build_object('context', v_retorno);
END;
$$;
