DO $$ 
DECLARE
    v_old_tenant UUID := 'd290f1ee-6c54-4b01-90e6-d701748f0851';
    v_new_tenant UUID := '50b8db71-d371-4561-8038-916588ee251e';
    v_old_agent_id UUID := '0e5a2927-1617-48a7-9e54-0834ddbbc924';
    v_new_agent_id UUID := gen_random_uuid();
BEGIN
    -- 1. Copiar o Agente Principal
    -- Selecionamos explicitamente os campos de configuração para não copiar meta-dados desnecessários ou conflituosos (ex: created_at, updated_at)
    INSERT INTO public.agents (
        id,
        tenant_id, 
        name, 
        role, 
        type, 
        status, 
        risk_level, 
        risk_score, 
        lifecycle_stage, 
        autonomy_level, 
        context_window, 
        session_timeout_seconds,
        brain_config, 
        voice_config, 
        integration_config, 
        whatsapp_provider, 
        whatsapp_api_type, 
        is_gatekeeper, 
        gatekeeper_scope,
        requires_security, 
        workflow_blueprint, 
        send_idle_closure_message, 
        idle_closure_message,
        applied_policies,
        channels,
        evolution_instance,
        evolution_token,
        meta_api_token,
        meta_phone_number_id,
        meta_waba_id,
        meta_verify_token,
        zenvia_channel_id,
        zenvia_api_token,
        zenvia_aliases
    )
    SELECT 
        v_new_agent_id,
        v_new_tenant, 
        name || ' (Cópia Edenred)', 
        role, 
        type, 
        status, 
        risk_level, 
        risk_score, 
        lifecycle_stage, 
        autonomy_level, 
        context_window, 
        session_timeout_seconds,
        brain_config, 
        voice_config, 
        integration_config, 
        whatsapp_provider, 
        whatsapp_api_type, 
        is_gatekeeper, 
        gatekeeper_scope,
        requires_security, 
        workflow_blueprint, 
        send_idle_closure_message, 
        idle_closure_message,
        applied_policies,
        channels,
        evolution_instance,
        evolution_token,
        meta_api_token,
        meta_phone_number_id,
        meta_waba_id,
        meta_verify_token,
        zenvia_channel_id,
        zenvia_api_token,
        zenvia_aliases
    FROM public.agents 
    WHERE id = v_old_agent_id;

    -- 2. Copiar as Ferramentas (Agent Tools)
    INSERT INTO public.agent_tools (
        tenant_id, 
        agent_id, 
        name, 
        description, 
        parameters_schema, 
        method, 
        url, 
        headers, 
        query_params,
        body_mapping,
        response_mode,
        output_schema,
        is_active,
        category
    )
    SELECT 
        v_new_tenant, 
        v_new_agent_id, 
        name, 
        description, 
        parameters_schema, 
        method, 
        url, 
        headers, 
        query_params,
        body_mapping,
        response_mode,
        output_schema,
        is_active,
        category
    FROM public.agent_tools
    WHERE agent_id = v_old_agent_id;

    -- 3. Copiar a Base de Conhecimento (Agent Knowledge)
    INSERT INTO public.agent_knowledge (
        tenant_id, 
        agent_id, 
        name, 
        content, 
        file_url, 
        file_type, 
        file_size, 
        embedding
    )
    SELECT 
        v_new_tenant, 
        v_new_agent_id, 
        name, 
        content, 
        file_url, 
        file_type, 
        file_size, 
        embedding
    FROM public.agent_knowledge
    WHERE agent_id = v_old_agent_id;

    RAISE NOTICE 'Agente copiado com sucesso! ID Original: %. Novo ID na nova empresa: %', v_old_agent_id, v_new_agent_id;
END $$;
