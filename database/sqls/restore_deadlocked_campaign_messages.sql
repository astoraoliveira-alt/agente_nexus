-- ============================================================
-- SCRIPT DE RECUPERAÇÃO DE MENSAGENS PÓS-DEADLOCK
-- Descrição: Restaura as mensagens que foram enviadas pela 
-- Evolution API (n8n), mas cujo registro no banco de dados
-- falhou devido a um deadlock (HTTP 500 no handle_outbound_sent).
-- ============================================================

DO $$
DECLARE
    r RECORD;
    v_conv_id UUID;
    v_msg_id UUID;
    v_clean_phone TEXT;
BEGIN
    FOR r IN (
        SELECT * FROM public.outbound_queue
        WHERE campaign_id = 'd917cd2c-7a5c-4f9f-9896-3a527082086d'
          AND status = 'not_delivered'
          AND sent_at IS NOT NULL
          AND metadata->>'message_id' IS NOT NULL
    ) LOOP
        -- Limpa o telefone
        v_clean_phone := regexp_replace(r.contact_phone, '\D', '', 'g');

        -- 1. Garante a Conversa (Cria ou Atualiza)
        INSERT INTO public.conversations (tenant_id, agent_id, user_identifier, user_name, channel, status, last_message_at)
        VALUES (r.tenant_id, r.agent_id, v_clean_phone, r.contact_name, 'whatsapp', 'ai_active', r.sent_at)
        ON CONFLICT (tenant_id, agent_id, user_identifier) 
        DO UPDATE SET status = 'ai_active', last_message_at = r.sent_at
        RETURNING id INTO v_conv_id;

        -- 2. Insere a Mensagem
        -- Verifica se a mensagem já existe via remote_id
        v_msg_id := NULL;
        SELECT id INTO v_msg_id FROM public.messages WHERE remote_id = r.metadata->>'message_id' LIMIT 1;
        
        IF v_msg_id IS NULL THEN
            INSERT INTO public.messages (
                tenant_id, 
                conversation_id, 
                content, 
                direction, 
                message_type, 
                sender_type, 
                remote_id, 
                created_at, 
                status, 
                metadata
            )
            VALUES (
                r.tenant_id, 
                v_conv_id, 
                r.metadata->>'content', 
                'outbound', 
                'text', 
                'agent', 
                r.metadata->>'message_id', 
                r.sent_at, 
                'sent',
                jsonb_build_object('campaign_id', r.campaign_id, 'queue_id', r.id)
            )
            RETURNING id INTO v_msg_id;
        END IF;

        -- 3. Insere o histórico para o Dashboard ler
        IF NOT EXISTS (SELECT 1 FROM public.message_status_history WHERE message_id = v_msg_id AND status = 'SENT') THEN
            INSERT INTO public.message_status_history (message_id, status, created_at)
            VALUES (v_msg_id, 'SENT', r.sent_at);
        END IF;

        -- 4. Atualiza a fila para refletir que foi "sent" com sucesso
        UPDATE public.outbound_queue
        SET status = 'sent', conversation_id = v_conv_id
        WHERE id = r.id;
        
    END LOOP;

    -- 5. Sincroniza os status da campanha no final
    PERFORM public.fn_sync_campaign_stats('d917cd2c-7a5c-4f9f-9896-3a527082086d');

END $$;
