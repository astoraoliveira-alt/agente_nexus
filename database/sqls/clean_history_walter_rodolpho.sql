-- ==============================================================================
-- LIMPEZA SEGURA DE CONVERSAS (PRODUÇÃO) - WALTER E RODOLPHO
-- Afeta exclusivamente:
-- 1) Walter: 5511950480926 (Conversa: 4998c2c8-002b-404b-a5ba-70200120d0bd)
-- 2) Rodolpho: 5511981948599 (Conversa: a7f650bc-dcbe-4a51-baae-48426fcff65c)
-- ==============================================================================

DO $$
DECLARE
    v_conv_ids UUID[] := ARRAY[
        '4998c2c8-002b-404b-a5ba-70200120d0bd'::UUID,
        'a7f650bc-dcbe-4a51-baae-48426fcff65c'::UUID
    ];
    v_phones TEXT[] := ARRAY[
        '5511950480926',
        '5511981948599'
    ];
    v_campaign_id UUID := '8f06e8dd-3cbf-4646-8f95-bb8cfeca4a5d'::UUID;
BEGIN
    -- 1. Limpar avaliacoes de QA dessas 2 conversas
    DELETE FROM public.evaluations
    WHERE conversation_id = ANY(v_conv_ids);

    -- 2. Limpar mensagens das filas de entrada/saida vinculadas a essas conversas
    DELETE FROM public.inbound_queue
    WHERE conversation_id = ANY(v_conv_ids);

    DELETE FROM public.agent_responses_queue
    WHERE conversation_id = ANY(v_conv_ids);

    -- 3. Limpar historico de mensagens do chat (para a LLM nao ler contexto antigo)
    DELETE FROM public.messages
    WHERE conversation_id = ANY(v_conv_ids);

    -- 4. Resetar contexto da LLM e fechar as conversas (Fresh Start garantido)
    UPDATE public.conversations
    SET 
        status = 'closed',
        context_state = '{}'::jsonb,
        metadata = '{}'::jsonb,
        last_message_at = NULL,
        reopened_at = NULL,
        updated_at = NOW()
    WHERE id = ANY(v_conv_ids);

    -- 5. Limpar metadados de simulacao nos leads da campanha especifica
    UPDATE public.agent_leads
    SET 
        status = 'pending',
        metadata = jsonb_build_object(
            'source', 'campaign_import',
            'cnpj', identifier,
            'razao_social', name
        )
    WHERE campaign_id = v_campaign_id
      AND whatsapp = ANY(v_phones);

    RAISE NOTICE 'Limpeza concluida com seguranca absoluta para Walter e Rodolpho.';
END $$;
