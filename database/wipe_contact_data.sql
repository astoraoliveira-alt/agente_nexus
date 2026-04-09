-- File: database/wipe_contact_data.sql
-- Description: Wipes all business data (conversations, messages, campaigns, contacts) for a specific phone number.
-- Usage: Run this script in the Supabase SQL editor. You can change the 'v_phone_digits' to target another number.

DO $$
DECLARE
    -- CÓDIGO DO TELEFONE PARA EXCLUIR
    v_phone_digits VARCHAR := '5511995269671';
    
    v_phone_pattern VARCHAR := '%' || v_phone_digits || '%';
    v_conv_ids UUID[];
BEGIN
    RAISE NOTICE 'Iniciando limpeza de dados comerciais para o lead: %', v_phone_digits;

    -- 1. Recuperar todos os IDs de conversas ligados a este número
    SELECT array_agg(id) INTO v_conv_ids
    FROM public.conversations
    WHERE user_identifier LIKE v_phone_pattern;
    
    RAISE NOTICE 'Conversas encontradas: %', COALESCE(array_length(v_conv_ids, 1), 0);

    IF v_conv_ids IS NOT NULL AND array_length(v_conv_ids, 1) > 0 THEN
        
        -- Limpar filas operacionais
        BEGIN
            DELETE FROM public.inbound_queue WHERE conversation_id = ANY(v_conv_ids);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            DELETE FROM public.inbound_queue_errors WHERE conversation_id = ANY(v_conv_ids);
        EXCEPTION WHEN OTHERS THEN NULL; END;
        
        BEGIN
            DELETE FROM public.agent_responses_queue WHERE conversation_id = ANY(v_conv_ids);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        -- Limpar incidentes (segurança) associados à conversa
        BEGIN
            DELETE FROM public.incidents WHERE conversation_id = ANY(v_conv_ids);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        -- Limpar memórias de avaliação e sucesso do agente
        BEGIN
            DELETE FROM public.agent_success_memory WHERE original_conversation_id = ANY(v_conv_ids);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            DELETE FROM public.evaluations WHERE conversation_id = ANY(v_conv_ids);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        -- Limpar artefatos físicos e histórico principal de mensagens
        BEGIN
            DELETE FROM public.conversation_artifacts WHERE conversation_id = ANY(v_conv_ids);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            DELETE FROM public.messages WHERE conversation_id = ANY(v_conv_ids);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        -- Por fim, aprofunda as conversas base
        BEGIN
            DELETE FROM public.conversations WHERE id = ANY(v_conv_ids);
        EXCEPTION WHEN OTHERS THEN NULL; END;

    END IF;

    -- 2. Limpar qualquer resíduo na fila de envios
    BEGIN
        DELETE FROM public.outbound_queue WHERE contact_phone LIKE v_phone_pattern;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    BEGIN
        DELETE FROM public.agent_responses_queue WHERE phone LIKE v_phone_pattern;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- 3. Deletar contato base da agenda (CRM)
    BEGIN
        DELETE FROM public.contacts 
        WHERE phone LIKE v_phone_pattern 
        OR identifier LIKE v_phone_pattern;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RAISE NOTICE 'Finalizada limpeza de dados de negócio para o lead % com sucesso.', v_phone_digits;
END $$;
