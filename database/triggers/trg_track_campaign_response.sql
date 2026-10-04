-- Trigger to automatically track campaign responses when a user replies
-- Logic:
-- 1. Watch for INSERT on messages
-- 2. If sender_type is 'user' (inbound)
-- 3. Find if this user is in an active campaign queue (outbound_queue) where response_detected is FALSE
-- 4. Mark response_detected = TRUE and increment campaign.response_count

CREATE OR REPLACE FUNCTION track_campaign_response()
RETURNS TRIGGER AS $$
DECLARE
    v_queue_id UUID;
    v_campaign_id UUID;
    v_user_phone VARCHAR;
    v_is_auto_reply BOOLEAN := FALSE;
    v_text TEXT;
BEGIN
    -- Only process inbound user messages
    IF NEW.sender_type = 'user' THEN
        
        BEGIN
            -- Get user identifier (phone) from conversation
            SELECT user_identifier INTO v_user_phone
            FROM conversations
            WHERE id = NEW.conversation_id;

            -- Find matching active outbound queue item
            -- V62.0: Suporte a múltiplos status de envio (sent, delivered, read)
            SELECT id, campaign_id INTO v_queue_id, v_campaign_id
            FROM outbound_queue
            WHERE tenant_id = NEW.tenant_id
              AND contact_phone = v_user_phone
              AND campaign_id IS NOT NULL
              AND response_detected = FALSE
              AND status IN ('sent', 'delivered', 'read', 'processing')
            ORDER BY created_at DESC
            LIMIT 1;

            -- If found, update tracking
            IF v_queue_id IS NOT NULL THEN
                v_text := COALESCE(NEW.content, '');
                
                -- Regra de Garantia: Cliques em botões do template NUNCA são auto-resposta
                IF lower(trim(v_text)) IN ('quero simular!', 'quero simular', 'falar com um agente!', 'falar com um agente', 'simular') THEN
                    v_is_auto_reply := FALSE;
                -- Detecção de padrões inequívocos de auto-resposta comercial / secretária eletrônica
                ELSIF v_text ~* '(agradece seu contato|como podemos ajudar|como posso te ajudar|não est(ou|amos) dispon[ií]ve|não estamos funcionando|não está funcionando|funcionamos de .* [aà]s?|fora de hor[aá]rio|hor[aá]rio de atendimento|horário de funcionamento|hor[aá]rio comercial|estamos fechados|faça seu pedido|nosso card[aá]pio|acesse nosso cat[aá]logo|atendente foi solicitado|atendimento feito por pessoas|responderemos assim que poss[ií]vel|em breve retornaremos|retornaremos em breve|retornaremos assim que|retornaremos o contato|expediente foi encerrado|hora marcada|pedidos pelo whatsapp|para realizar seu pedido|para agilizar (o|seu) atendimento|agilizar o seu atendimento|endere[cç]o de entrega|AutoResponder|prezado(a)? cliente|voc[eê] est[aá] n[ao]|voc[eê] talvez busque|ordem de chegada|cobramos taxa|seja bem-vindo|bem-vindo(a)? [aà]|obrigad[ao] pelo contato|obrigad[ao] pela compreens[aã]o|conheça nossas m[ií]dias|mensagem autom[aá]tica|resposta autom[aá]tica|atendimento autom[aá]tico|este canal [eé] exclusivo|este n[uú]mero (não recebe|não aceita) ligaç)' THEN
                    v_is_auto_reply := TRUE;
                ELSE
                    -- Em dúvida: registra como humano
                    v_is_auto_reply := FALSE;
                END IF;

                -- 1. Mark queue item as responded with audit flags
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

                -- 2. Increment campaign response count
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

-- Drop trigger if exists to allow update
DROP TRIGGER IF EXISTS trg_track_campaign_response ON messages;

-- Create Trigger
CREATE TRIGGER trg_track_campaign_response
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION track_campaign_response();
