-- DAVOS NEXUS - RPC: fn_fetch_next_inbound_message
-- Descrição: Busca a próxima mensagem da fila, enriquece com dados do agente, lead, ferramentas e histórico.
-- Versão: 2026.04.18 (Preserva estrutura integral do usuário + correções de campos Meta)

CREATE OR REPLACE FUNCTION public.fn_fetch_next_inbound_message(
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

    v_mod_brain_config JSONB;
    v_temp_sys_prompt TEXT;
    v_temp_user_prompt TEXT;
BEGIN
    -- [PROD] Busca Mensagem
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
        RETURN jsonb_build_object(
            'success', false,
            'status', 'empty',
            'message', 'No pending messages'
        );
    END IF;

    -- [PROD] Contexto
    v_phone_clean := regexp_replace(split_part(v_record.payload->>'phone', '@', 1), '\D', '', 'g');

    SELECT * INTO v_agent
    FROM public.agents
    WHERE id = v_record.agent_id;

    SELECT * INTO v_conv
    FROM public.conversations
    WHERE id = v_record.conversation_id;

    -- [PROD] Lead Search (DDD+Num)
    SELECT *
    INTO v_lead
    FROM public.agent_leads
    WHERE tenant_id = v_agent.tenant_id
      AND (
        whatsapp = RIGHT(v_phone_clean, 11)
        OR whatsapp = RIGHT(v_phone_clean, 10)
        OR whatsapp = v_phone_clean
        OR identifier = v_phone_clean
      )
    ORDER BY created_at DESC
    LIMIT 1;

    -- [PROD] Variáveis {{LEAD_NAME/CNPJ}}
    v_mod_brain_config := v_agent.brain_config;
    v_temp_sys_prompt  := v_mod_brain_config->>'systemPrompt';
    v_temp_user_prompt := v_mod_brain_config->>'userPromptTemplate';

    IF v_temp_sys_prompt IS NOT NULL THEN
        v_temp_sys_prompt := replace(v_temp_sys_prompt, '{{LEAD_NAME}}', COALESCE(trim(v_lead.name), ''));
        v_temp_sys_prompt := replace(v_temp_sys_prompt, '{{LEAD_CNPJ}}', COALESCE(trim(v_lead.identifier), ''));
        v_mod_brain_config := jsonb_set(v_mod_brain_config, '{systemPrompt}', to_jsonb(v_temp_sys_prompt));
    END IF;

    IF v_temp_user_prompt IS NOT NULL THEN
        v_temp_user_prompt := replace(v_temp_user_prompt, '{{LEAD_NAME}}', COALESCE(trim(v_lead.name), ''));
        v_temp_user_prompt := replace(v_temp_user_prompt, '{{LEAD_CNPJ}}', COALESCE(trim(v_lead.identifier), ''));
        v_mod_brain_config := jsonb_set(v_mod_brain_config, '{userPromptTemplate}', to_jsonb(v_temp_user_prompt));
    END IF;

    -- [MOD] Histórico com Isolamento Temporal
    SELECT jsonb_agg(h)
    INTO v_history
    FROM (
        SELECT sender_type, content, created_at
        FROM (
            SELECT sender_type, content, created_at
            FROM public.messages
            WHERE conversation_id = v_record.conversation_id
              AND (v_conv.reopened_at IS NULL OR created_at >= v_conv.reopened_at)
            ORDER BY created_at DESC
            LIMIT 10
        ) sub
        ORDER BY created_at ASC
    ) h;

    -- [PROD] Segurança
    SELECT status, validated_identifier
    INTO v_session_status, v_session_identifier
    FROM public.conversation_security_sessions
    WHERE conversation_id = v_record.conversation_id
      AND status = 'active'
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    -- [PROD] Sub-Agentes
    SELECT jsonb_agg(sub)
    INTO v_sub_agents
    FROM (
        SELECT
            a.id,
            a.name,
            a.role,
            a.status,
            a.is_gatekeeper,
            a.brain_config->>'modelId' AS model_id,
            a.brain_config->>'systemPrompt' AS system_prompt,
            (a.brain_config->>'temperature')::numeric AS temperature,
            (
                SELECT COALESCE(jsonb_agg(t_item), '[]'::jsonb)
                FROM (
                    SELECT
                        name,
                        description,
                        parameters_schema AS parameters,
                        method,
                        url,
                        headers,
                        category
                    FROM public.agent_tools t
                    WHERE t.agent_id = a.id
                      AND t.is_active = TRUE
                ) t_item
            ) AS tools
        FROM public.agents a
        WHERE a.parent_agent_id = v_record.agent_id
    ) sub;

    -- [PROD] Ferramentas
    SELECT jsonb_agg(t_row)
    INTO v_tools
    FROM (
        SELECT
            name,
            description,
            parameters_schema AS parameters,
            method,
            url,
            headers,
            category
        FROM public.agent_tools
        WHERE tenant_id = v_agent.tenant_id
          AND (agent_id = v_record.agent_id OR agent_id IS NULL)
          AND is_active = TRUE
    ) t_row;

    -- [PROD] Governança
    SELECT status
    INTO v_company_status
    FROM public.companies
    WHERE id = v_agent.tenant_id;

    SELECT COUNT(*)
    INTO v_active_conv_count
    FROM public.conversations
    WHERE agent_id = v_record.agent_id
      AND status = 'ai_active';

    SELECT status
    INTO v_contact_status
    FROM public.contacts
    WHERE tenant_id = v_agent.tenant_id
      AND identifier = v_phone_clean
    LIMIT 1;

    IF v_agent.applied_policies IS NOT NULL
       AND array_length(v_agent.applied_policies, 1) > 0 THEN
        v_governance_rules := jsonb_build_object(
            'canDo', COALESCE((
                SELECT jsonb_agg(DISTINCT r)
                FROM public.policies p2,
                     jsonb_array_elements_text(p2.rules->'canDo') r
                WHERE (p2.id::TEXT = ANY(v_agent.applied_policies))
                  AND p2.is_active = TRUE
            ), '[]'::jsonb),
            'cannotDo', COALESCE((
                SELECT jsonb_agg(DISTINCT r)
                FROM public.policies p2,
                     jsonb_array_elements_text(p2.rules->'cannotDo') r
                WHERE (p2.id::TEXT = ANY(v_agent.applied_policies))
                  AND p2.is_active = TRUE
            ), '[]'::jsonb),
            'transferConditions', COALESCE((
                SELECT jsonb_agg(DISTINCT r)
                FROM public.policies p2,
                     jsonb_array_elements_text(p2.rules->'transferConditions') r
                WHERE (p2.id::TEXT = ANY(v_agent.applied_policies))
                  AND p2.is_active = TRUE
            ), '[]'::jsonb)
        );
    ELSE
        v_governance_rules := '{"canDo": [], "cannotDo": [], "transferConditions": []}'::jsonb;
    END IF;

    -- [PROD] Mapping Integral de Retorno
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
        'message', v_record.payload->>'content',
        'messages_history', COALESCE(v_history, '[]'::jsonb),
        'message_type', COALESCE(v_record.message_type, 'conversation'),
        'is_ai', true,
        'atendimento_tipo', 'IA',

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
            'workflow_blueprint', v_agent.workflow_blueprint
        ),

        'lead_info', jsonb_build_object(
            'is_lead', (v_lead.id IS NOT NULL),
            'name', COALESCE(v_lead.name, v_record.payload->>'name', 'Usuário'),
            'link', COALESCE(v_lead.cta_link, ''),
            'cnpj', COALESCE(v_lead.identifier, '')
        ),

        'conversation', jsonb_build_object(
            'id', v_record.conversation_id,
            'status', COALESCE(v_conv.status, 'ai_active'),
            'context_state', COALESCE(v_conv.context_state, '{}'::jsonb),
            'reopened', COALESCE(v_conv.status = 'closed', FALSE)
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
            'remoteID', v_record.payload->>'remoteID'
        )
    );

    UPDATE public.inbound_queue
    SET context = v_retorno
    WHERE id = v_record.id;

    RETURN v_retorno || jsonb_build_object('context', v_retorno);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_fetch_next_inbound_message(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fetch_next_inbound_message(TEXT) TO service_role;
