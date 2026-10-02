-- ============================================================
-- Migration: 20261002_track_campaign_response_bot_filter.sql
-- Descrição:
-- Atualiza o trigger track_campaign_response para identificar automaticamente
-- quando a resposta inicial de um contato é uma auto-resposta de WhatsApp Business
-- (mensagens de ausência, cardápios, horário de funcionamento, URA).
-- Grava 'is_auto_reply' e 'human_interaction' no metadata da outbound_queue.
-- ============================================================

CREATE OR REPLACE FUNCTION track_campaign_response()
RETURNS TRIGGER AS $$
DECLARE
    v_queue_id UUID;
    v_campaign_id UUID;
    v_user_phone VARCHAR;
    v_is_auto_reply BOOLEAN := FALSE;
    v_text TEXT;
BEGIN
    -- Processa apenas mensagens inbound de usuário
    IF NEW.sender_type = 'user' THEN
        
        BEGIN
            -- Recupera o telefone a partir da conversa
            SELECT user_identifier INTO v_user_phone
            FROM conversations
            WHERE id = NEW.conversation_id;

            -- Localiza o item da fila de saída correspondente
            SELECT id, campaign_id INTO v_queue_id, v_campaign_id
            FROM outbound_queue
            WHERE tenant_id = NEW.tenant_id
              AND contact_phone = v_user_phone
              AND campaign_id IS NOT NULL
              AND response_detected = FALSE
              AND status IN ('sent', 'delivered', 'read', 'processing')
            ORDER BY created_at DESC
            LIMIT 1;

            IF v_queue_id IS NOT NULL THEN
                v_text := COALESCE(NEW.content, '');
                
                -- Regra de Garantia: Cliques em botões do template NUNCA são auto-resposta
                IF lower(trim(v_text)) IN ('quero simular!', 'quero simular', 'falar com um agente!', 'falar com um agente', 'simular') THEN
                    v_is_auto_reply := FALSE;
                -- Detecção de padrões inequívocos de auto-resposta comercial / secretária eletrônica
                ELSIF v_text ~* '(agradece seu contato|como podemos ajudar|não est(ou|amos) dispon[ií]ve|fora de hor[aá]rio|hor[aá]rio de atendimento|horário de funcionamento|estamos fechados|faça seu pedido|nosso card[aá]pio|acesse nosso cat[aá]logo|atendente foi solicitado|atendimento feito por pessoas|responderemos assim que poss[ií]vel|expediente foi encerrado|hora marcada|pedidos pelo whatsapp|para realizar seu pedido)' THEN
                    v_is_auto_reply := TRUE;
                ELSE
                    -- Em dúvida: registra como humano
                    v_is_auto_reply := FALSE;
                END IF;

                -- 1. Atualiza a fila com a flag auditável
                UPDATE outbound_queue
                SET response_detected = TRUE,
                    metadata = jsonb_set(
                        jsonb_set(
                            COALESCE(metadata, '{}'::jsonb),
                            '{is_auto_reply}',
                            to_jsonb(v_is_auto_reply)
                        ),
                        '{human_interaction}',
                        to_jsonb(NOT v_is_auto_reply)
                    )
                WHERE id = v_queue_id;

                -- 2. Incrementa o contador de respostas da campanha
                UPDATE campaigns
                SET response_count = response_count + 1,
                    updated_at = NOW()
                WHERE id = v_campaign_id;
                
            END IF;

        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Error in track_campaign_response trigger: %', SQLERRM;
        END;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
