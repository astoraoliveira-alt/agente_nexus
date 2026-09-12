-- ==============================================================================
-- MIGRAÇÃO DE AGENTE: CLONAGEM DO FLUXO FISERV PARA EDENRED
-- Objetivo: Copiar o "Agente Fiserv - Teste Simulacao" para a empresa Edenred
-- ==============================================================================

DO $$
DECLARE
    v_source_agent_id UUID := '007b8c68-5601-410c-b88a-db7e3317e9ec'; -- ID do Agente Fiserv (da Imagem)
    v_target_tenant_id UUID := 'd290f1ee-6c54-4b01-90e6-d701748f0851'; -- ID da Company Edenred (da Imagem anterior)
    v_new_agent_id UUID := gen_random_uuid();
BEGIN
    -- 1. Renomear o agente antigo da Edenred para indicar que é Legado
    UPDATE agents
    SET name = 'Agente Comercial (Legado)'
    WHERE tenant_id = v_target_tenant_id;

    -- 2. Clonar o Agente Fiserv inserindo-o no tenant da Edenred
    INSERT INTO agents (
        id,
        tenant_id,
        name,
        status,
        brain_config,
        voice_config,
        channels,
        applied_policies,
        type,
        integration_config,
        session_timeout_seconds,
        evolution_instance,
        evolution_token,
        context_window,
        whatsapp_api_type,
        role,
        meta_api_token,
        is_gatekeeper,
        gatekeeper_scope,
        requires_security,
        gatekeeper_config,
        meta_phone_number_id,
        zenvia_channel_id,
        zenvia_api_token,
        whatsapp_provider,
        workflow_blueprint,
        meta_waba_id,
        meta_verify_token,
        zenvia_aliases,
        send_idle_closure_message,
        idle_closure_message,
        created_at,
        updated_at
    )
    SELECT
        v_new_agent_id,
        v_target_tenant_id,
        'Agente Comercial Fiserv (Novo)', -- Novo Nome na Edenred
        'active', -- Garantir que nasce ativo
        brain_config,
        voice_config,
        channels,
        applied_policies,
        type,
        integration_config,
        session_timeout_seconds,
        evolution_instance,
        evolution_token,
        context_window,
        whatsapp_api_type,
        role,
        meta_api_token,
        is_gatekeeper,
        gatekeeper_scope,
        requires_security,
        gatekeeper_config,
        meta_phone_number_id,
        zenvia_channel_id,
        zenvia_api_token,
        whatsapp_provider,
        workflow_blueprint,
        meta_waba_id,
        meta_verify_token,
        zenvia_aliases,
        send_idle_closure_message,
        idle_closure_message,
        now(),
        now()
    FROM agents
    WHERE id = v_source_agent_id;

    RAISE NOTICE 'Migração concluída! Novo agente criado com ID: %', v_new_agent_id;
END $$;
