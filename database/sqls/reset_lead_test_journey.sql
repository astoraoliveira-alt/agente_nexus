-- ==============================================================================
-- RESET COMPLETO DE METADADOS & HISTÓRICO PARA TESTE DA JORNADA COMPLETA
-- ==============================================================================
-- Instruções:
-- 1. Abra o SQL Editor no Supabase.
-- 2. Altere a variável 'v_phone' abaixo com o seu telefone de teste (com DDD e 55).
-- 3. (Opcional) Altere 'v_cnpj' se quiser resetar também pelo CNPJ cadastrado.
-- 4. Clique em "Run".
-- ==============================================================================

DO $$
DECLARE
    -- 📱 CONFIGURE SEU NÚMERO DE TESTE AQUI (Ex: '5511993434870'):
    v_phone TEXT := '5511993434870';
    
    -- 🏢 (OPCIONAL) CONFIGURE SEU CNPJ AQUI (ou deixe vazio ''):
    v_cnpj  TEXT := '43911215000177';

    v_phone_clean TEXT;
    v_phone_short TEXT;
    v_conv_ids UUID[];
    v_deleted_msgs INT := 0;
    v_updated_leads INT := 0;
    v_updated_convs INT := 0;
    v_updated_oq INT := 0;
BEGIN
    v_phone_clean := regexp_replace(COALESCE(v_phone, ''), '\D', '', 'g');
    v_phone_short := RIGHT(v_phone_clean, 11);

    IF v_phone_clean = '' AND v_cnpj = '' THEN
        RAISE EXCEPTION 'Informe ao menos o telefone (v_phone) ou o CNPJ (v_cnpj) para executar o reset.';
    END IF;

    RAISE NOTICE 'Iniciando reset total para Telefone: % (Sufixo: %) | CNPJ: %', v_phone_clean, v_phone_short, v_cnpj;

    -- 1. Recuperar IDs das conversas vinculadas a este contato
    SELECT array_agg(id) INTO v_conv_ids
    FROM public.conversations
    WHERE (
        v_phone_short <> '' AND (
            user_identifier LIKE '%' || v_phone_short || '%'
            OR user_identifier = v_phone_clean
        )
    );

    IF v_conv_ids IS NOT NULL AND array_length(v_conv_ids, 1) > 0 THEN
        -- 2. Limpar mensagens da conversa (apaga o histórico anterior para a IA não lembrar de perguntas antigas)
        WITH del_m AS (
            DELETE FROM public.messages
            WHERE conversation_id = ANY(v_conv_ids)
            RETURNING id
        )
        SELECT COUNT(*) INTO v_deleted_msgs FROM del_m;

        -- 3. Limpar filas transitórias de entrada/saída
        BEGIN
            DELETE FROM public.inbound_queue WHERE conversation_id = ANY(v_conv_ids);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            DELETE FROM public.agent_responses_queue WHERE conversation_id = ANY(v_conv_ids);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        -- 4. Resetar estado da conversa (zera contexto, fecha e reabre com fresh start)
        WITH upd_c AS (
            UPDATE public.conversations
            SET 
                status = 'ai_active',
                context_state = '{}'::jsonb,
                metadata = '{}'::jsonb,
                last_message_at = NULL,
                reopened_at = NOW(),
                updated_at = NOW()
            WHERE id = ANY(v_conv_ids)
            RETURNING id
        )
        SELECT COUNT(*) INTO v_updated_convs FROM upd_c;
    END IF;

    -- 5. Resetar METADADOS DO LEAD em agent_leads (remove propostas, opt-in, fiserv_status e faturamento)
    WITH upd_l AS (
        UPDATE public.agent_leads
        SET 
            status = 'pending',
            metadata = metadata 
                - 'consent'
                - 'opt_in'
                - 'optin'
                - 'requested_amount'
                - 'revenue'
                - 'valor_inicial'
                - 'faturamento'
                - 'fiserv_status'
                - 'fiserv_external_status'
                - 'fiserv_offer_sent'
                - 'fiserv_offer_sent_at'
                - 'fiserv_offer_data'
                - 'fiserv_amount_approved'
                - 'max_installments'
                - 'taxa_aprovada'
                - 'loan_request_id'
                - 'simularam'
                - 'simulation_requested'
                - 'simulation_data'
                - 'simulation_accepted'
                - 'simulation_accepted_at'
                - 'ok_agente'
                - 'accepted_proposal'
                - 'formalization_status'
                - 'formalized_at'
                - 'formalized_amount'
                - 'formalized_installments'
                - 'identity_confirmed'
                - 'cnpj_confirmed'
                - 'devolutiva_sent_at'
                - 'fiserv_polling_at'
                - 'fiserv_requested_at'
                - 'circuit_breaker'
                - 'stop_flow'
                - 'close_conversation'
                - 'is_refused'
                - 'handoff_requested'
                - 'falar_agente'
                - 'pipeline_stage'
                - 'reeng_group_b_sent_at'
                - 'reeng_group_b_msg_id'
        WHERE (
            (v_phone_short <> '' AND regexp_replace(whatsapp, '\D', '', 'g') LIKE '%' || v_phone_short || '%')
            OR (v_cnpj <> '' AND identifier = regexp_replace(v_cnpj, '\D', '', 'g'))
        )
        RETURNING id
    )
    SELECT COUNT(*) INTO v_updated_leads FROM upd_l;

    -- 6. Resetar status na fila de envio de campanha (outbound_queue) se houver disparo prévio
    IF v_phone_short <> '' THEN
        WITH upd_oq AS (
            UPDATE public.outbound_queue
            SET 
                response_detected = FALSE,
                status = 'delivered',
                metadata = metadata 
                    - 'responded' 
                    - 'button_reply' 
                    - 'human_interaction' 
                    - 'button_clicked' 
                    - 'is_auto_reply' 
                    - 'is_bot'
            WHERE regexp_replace(contact_phone, '\D', '', 'g') LIKE '%' || v_phone_short || '%'
            RETURNING id
        )
        SELECT COUNT(*) INTO v_updated_oq FROM upd_oq;
    END IF;

    RAISE NOTICE '==================================================';
    RAISE NOTICE '✅ RESET CONCLUÍDO COM SUCESSO:';
    RAISE NOTICE ' • Conversas resetadas: %', v_updated_convs;
    RAISE NOTICE ' • Mensagens antigas apagadas: %', v_deleted_msgs;
    RAISE NOTICE ' • Leads resetados (agent_leads): %', v_updated_leads;
    RAISE NOTICE ' • Envios resetados na outbound_queue: %', v_updated_oq;
    RAISE NOTICE '==================================================';
    RAISE NOTICE '👉 Agora você pode enviar "Quero Simular" ou iniciar a jornada do zero!';
END $$;
