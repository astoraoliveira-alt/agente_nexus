-- 🛡️ PROTEÇÃO: Garantir que a função não seja duplicada com assinaturas diferentes
DROP FUNCTION IF EXISTS public.fn_get_agent_context(uuid, varchar, varchar, jsonb, uuid);

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
    v_conv_id UUID;
    v_retorno JSONB;
    v_active_incidents JSONB; -- 🔥 Adicionado para o novo módulo de incidentes
BEGIN
    v_phone_clean := regexp_replace(split_part(p_user_identifier, '@', 1), '\D', '', 'g');
    v_conv_id := COALESCE(p_conversation_id, gen_random_uuid());

    SELECT * INTO v_agent FROM public.agents WHERE id = p_agent_id;
    SELECT * INTO v_conv FROM public.conversations WHERE id = v_conv_id;
    
    SELECT * INTO v_lead FROM public.agent_leads 
    WHERE tenant_id = v_agent.tenant_id 
    AND (whatsapp ILIKE '%' || RIGHT(v_phone_clean, 8) OR identifier = v_phone_clean)
    LIMIT 1;

    SELECT status, validated_identifier INTO v_session_status, v_session_identifier
    FROM public.conversation_security_sessions
    WHERE conversation_id = v_conv_id AND status = 'active' AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1;

    -- Sub-Agentes e Tools
    SELECT jsonb_agg(sub) INTO v_sub_agents FROM (
        SELECT 
            a.id, a.name, a.role, a.status, a.is_gatekeeper,
            a.brain_config->>'modelId' as model_id,
            a.brain_config->>'systemPrompt' as system_prompt,
            (a.brain_config->>'temperature')::numeric as temperature,
            (SELECT COALESCE(jsonb_agg(t_item), '[]'::jsonb) FROM (
                SELECT name, description, parameters_schema as parameters, method, url, headers, category FROM public.agent_tools t 
                WHERE t.agent_id = a.id AND t.is_active = TRUE
            ) t_item) as tools
        FROM public.agents a WHERE a.parent_agent_id = p_agent_id
    ) sub;

    SELECT jsonb_agg(t_row) INTO v_tools FROM (
        SELECT name, description, parameters_schema as parameters, method, url, headers, category
        FROM public.agent_tools WHERE tenant_id = v_agent.tenant_id AND (agent_id = p_agent_id OR agent_id IS NULL) AND is_active = TRUE
    ) t_row;

    -- Governança
    SELECT status INTO v_company_status FROM public.companies WHERE id = v_agent.tenant_id;
    SELECT COUNT(*) INTO v_active_conv_count FROM public.conversations WHERE agent_id = p_agent_id AND status = 'ai_active';
    SELECT status INTO v_contact_status FROM public.contacts WHERE tenant_id = v_agent.tenant_id AND identifier = v_phone_clean;

    -- 🔥 Novo: Busca de incidentes ativos para este tenant
    SELECT jsonb_agg(inc) INTO v_active_incidents FROM (
        SELECT id, campaign_id, problem_description, response_message, mode
        FROM public.system_incidents 
        WHERE tenant_id = v_agent.tenant_id 
          AND status = 'active'
    ) inc;

    IF v_agent.applied_policies IS NOT NULL AND array_length(v_agent.applied_policies, 1) > 0 THEN
        v_governance_rules := jsonb_build_object(
            'canDo', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM public.policies p2, jsonb_array_elements_text(p2.rules->'canDo') r WHERE (p2.id::TEXT = ANY(v_agent.applied_policies)) AND p2.is_active = TRUE), '[]'::jsonb),
            'cannotDo', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM public.policies p2, jsonb_array_elements_text(p2.rules->'cannotDo') r WHERE (p2.id::TEXT = ANY(v_agent.applied_policies)) AND p2.is_active = TRUE), '[]'::jsonb),
            'transferConditions', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM public.policies p2, jsonb_array_elements_text(p2.rules->'transferConditions') r WHERE (p2.id::TEXT = ANY(v_agent.applied_policies)) AND p2.is_active = TRUE), '[]'::jsonb)
        );
    ELSE
        v_governance_rules := '{"canDo": [], "cannotDo": [], "transferConditions": []}'::jsonb;
    END IF;

    v_retorno := jsonb_build_object(
        'status', 'success',
        'status_rpc', 'success',
        'agent_id', p_agent_id,
        'tenant_id', v_agent.tenant_id,
        'message_type', COALESCE(p_metadata->>'message_type', 'conversation'),
        
        'agent', jsonb_build_object(
            'id', p_agent_id,
            'name', v_agent.name,
            'role', COALESCE(v_agent.role, 'Consultor de Vendas'),
            'meta_api_token', v_agent.meta_api_token,
            'whatsapp_api_type', v_agent.whatsapp_api_type,
            'whatsapp_provider', COALESCE(v_agent.whatsapp_provider, 'evolution'),
            'zenvia_channel_id', v_agent.zenvia_channel_id,
            'contextWindow', v_agent.context_window,
            'brain_config', v_agent.brain_config,
            'greeting_message', COALESCE(v_agent.brain_config->>'greetingMessage', ''),
            'sub_agents', COALESCE(v_sub_agents, '[]'::jsonb),
            'tools', COALESCE(v_tools, '[]'::jsonb),
            'active_incidents', COALESCE(v_active_incidents, '[]'::jsonb) -- 🔥 Injetado aqui
        ),
        'lead_info', jsonb_build_object(
            'is_lead', (v_lead.id IS NOT NULL),
            'name', COALESCE(v_lead.name, p_user_name),
            'link', COALESCE(v_lead.cta_link, ''),
            'cnpj', COALESCE(v_lead.identifier, '')
        ),
        'conversation', jsonb_build_object(
            'id', v_conv_id, 
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
        )
    );

    RETURN v_retorno || jsonb_build_object('context', v_retorno);
END;
$$;
