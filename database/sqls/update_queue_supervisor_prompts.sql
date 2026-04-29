-- ======================================================== --
-- DAVOS NEXUS - SUPERVISOR DE FILA (CONVERSATIONAL STATE) --
-- Update: Dynamic Prompt Injection directly in Queue      --
-- ======================================================== --

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
    v_messages_history JSONB;
    v_retorno JSONB;
    v_mod_brain_config JSONB;
    v_temp_sys_prompt TEXT;
    v_temp_user_prompt TEXT;
BEGIN
    -- [A] Pega e trava a mensagem
    UPDATE public.inbound_queue
    SET 
        status = 'assigned',
        locked_at = NOW(),
        n8n_execution_id = COALESCE(p_n8n_execution_id, n8n_execution_id)
    WHERE id = (
        SELECT id FROM public.inbound_queue
        WHERE status = 'pending'
        ORDER BY priority DESC NULLS LAST, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING * INTO v_record;

    IF v_record.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'status', 'empty', 'message', 'No pending messages');
    END IF;

    -- [B] Normalização de Telefone
    v_phone_clean := regexp_replace(split_part(v_record.payload->>'phone', '@', 1), '\D', '', 'g');

    -- [C] Busca Agente e Conversa
    SELECT * INTO v_agent FROM public.agents WHERE id = v_record.agent_id;
    SELECT * INTO v_conv FROM public.conversations WHERE id = v_record.conversation_id;
    v_mod_brain_config := v_agent.brain_config;
    
    -- [D] Busca Lead
    SELECT * INTO v_lead FROM public.agent_leads 
    WHERE tenant_id = v_agent.tenant_id 
    AND (whatsapp ILIKE '%' || RIGHT(v_phone_clean, 8) OR identifier = v_phone_clean)
    LIMIT 1;

    -- [D.2] INJETAR VARIAVEIS NO PROMPT (Dinâmico para LLM receber pelo N8N)
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

    -- Fallbacks para o caso de usarem snake_case no futuro
    v_temp_sys_prompt  := v_mod_brain_config->>'system_prompt';
    v_temp_user_prompt := v_mod_brain_config->>'user_prompt_template';

    IF v_temp_sys_prompt IS NOT NULL THEN
        v_temp_sys_prompt := replace(v_temp_sys_prompt, '{{LEAD_NAME}}', COALESCE(trim(v_lead.name), ''));
        v_temp_sys_prompt := replace(v_temp_sys_prompt, '{{LEAD_CNPJ}}', COALESCE(trim(v_lead.identifier), ''));
        v_mod_brain_config := jsonb_set(v_mod_brain_config, '{system_prompt}', to_jsonb(v_temp_sys_prompt));
    END IF;

    IF v_temp_user_prompt IS NOT NULL THEN
        v_temp_user_prompt := replace(v_temp_user_prompt, '{{LEAD_NAME}}', COALESCE(trim(v_lead.name), ''));
        v_temp_user_prompt := replace(v_temp_user_prompt, '{{LEAD_CNPJ}}', COALESCE(trim(v_lead.identifier), ''));
        v_mod_brain_config := jsonb_set(v_mod_brain_config, '{user_prompt_template}', to_jsonb(v_temp_user_prompt));
    END IF;


    -- [E] Histórico de Conversa (V50.11)
    SELECT COALESCE(jsonb_agg(msg), '[]'::jsonb) INTO v_messages_history
    FROM (
        SELECT 
            CASE 
                WHEN sender_type IN ('assistant', 'campaign', 'agent') THEN v_agent.name 
                ELSE 'Cliente' 
            END as role,
            content as text,
            created_at as timestamp
        FROM public.messages
        WHERE conversation_id = v_record.conversation_id
          AND (v_conv.reopened_at IS NULL OR created_at >= v_conv.reopened_at) -- Mantenção do isolamento REOPEN!
        ORDER BY created_at DESC
        LIMIT 10
    ) h, LATERAL (SELECT h.* ORDER BY h.timestamp ASC) msg;

    -- [F] Sessão de Segurança
    SELECT status, validated_identifier INTO v_session_status, v_session_identifier
    FROM public.conversation_security_sessions
    WHERE conversation_id = v_record.conversation_id AND status = 'active' AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1;

    -- [G] Sub-Agentes e Tools
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
        FROM public.agents a WHERE a.parent_agent_id = v_record.agent_id
    ) sub;

    SELECT jsonb_agg(t_row) INTO v_tools FROM (
        SELECT name, description, parameters_schema as parameters, method, url, headers, category
        FROM public.agent_tools WHERE tenant_id = v_agent.tenant_id AND (agent_id = v_record.agent_id OR agent_id IS NULL) AND is_active = TRUE
    ) t_row;

    -- [H] Governança
    SELECT status INTO v_company_status FROM public.companies WHERE id = v_agent.tenant_id;
    SELECT COUNT(*) INTO v_active_conv_count FROM public.conversations WHERE agent_id = v_record.agent_id AND status = 'ai_active';
    SELECT status INTO v_contact_status FROM public.contacts WHERE tenant_id = v_agent.tenant_id AND identifier = v_phone_clean LIMIT 1;

    IF v_agent.applied_policies IS NOT NULL AND array_length(v_agent.applied_policies, 1) > 0 THEN
        v_governance_rules := jsonb_build_object(
            'canDo', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM public.policies p2, jsonb_array_elements_text(p2.rules->'canDo') r WHERE (p2.id::TEXT = ANY(v_agent.applied_policies)) AND p2.is_active = TRUE), '[]'::jsonb),
            'cannotDo', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM public.policies p2, jsonb_array_elements_text(p2.rules->'cannotDo') r WHERE (p2.id::TEXT = ANY(v_agent.applied_policies)) AND p2.is_active = TRUE), '[]'::jsonb),
            'transferConditions', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM public.policies p2, jsonb_array_elements_text(p2.rules->'transferConditions') r WHERE (p2.id::TEXT = ANY(v_agent.applied_policies)) AND p2.is_active = TRUE), '[]'::jsonb)
        );
    ELSE
        v_governance_rules := '{"canDo": [], "cannotDo": [], "transferConditions": []}'::jsonb;
    END IF;

    -- [I] CONSTRUÇÃO DO RETORNO (V50.11 com Prompt Injection Dinâmico)
    v_retorno := jsonb_build_object(
        'status', 'success',
        'status_rpc', 'success',
        'id', v_record.id,
        'trace_id', v_record.trace_id,
        'tenant_id', v_record.tenant_id,
        'agent_id', v_record.agent_id,
        'message', v_record.payload->>'content',
        'messages_history', v_messages_history,
        
        'agent', jsonb_build_object(
            'id', v_agent.id,
            'name', v_agent.name,
            'role', COALESCE(v_agent.role, 'Consultor de Vendas'),
            'whatsapp_provider', COALESCE(v_agent.whatsapp_provider, 'evolution'),
            'brain_config', v_mod_brain_config, -- <--- PROMPT INJETADO AQUI!
            'sub_agents', COALESCE(v_sub_agents, '[]'::jsonb),
            'tools', COALESCE(v_tools, '[]'::jsonb)
        ),
        'lead_info', jsonb_build_object(
            'is_lead', (v_lead.id IS NOT NULL),
            'name', COALESCE(v_lead.name, v_record.payload->>'name', 'Usuário'),
            'cnpj', COALESCE(v_lead.identifier, ''),
            'link', COALESCE(v_lead.cta_link, '')
        ),
        'conversation', jsonb_build_object(
            'id', v_record.conversation_id, 
            'status', COALESCE(v_conv.status, 'ai_active'), 
            'context_state', COALESCE(v_conv.context_state, '{}'::jsonb)
        ),
        'governance', jsonb_build_object(
            'agente_ativo', (v_agent.status = 'active'),
            'empresa_ativa', (v_company_status = 'active'),
            'rules', v_governance_rules
        ),
        'payload', jsonb_build_object(
            'phone', v_phone_clean,
            'instance', COALESCE(v_agent.evolution_instance, 'evolution'),
            'remoteID', v_record.payload->>'remoteID'
        )
    );

    UPDATE public.inbound_queue SET context = v_retorno WHERE id = v_record.id;
    RETURN v_retorno || jsonb_build_object('context', v_retorno);
END;
$$;
