-- ============================================================
-- Migration: 20261021_strict_button_only_campaign_interaction.sql
-- Descrição:
-- Restringe a contabilização de interação de campanha (campaigns.response_count)
-- ESTRITAMENTE ao clique factual em botões ("Quero Simular" ou "Falar com Agente / Especialista").
-- Nenhuma mensagem de texto avulsa, saudação humana (oi, bom dia) ou auto-resposta comercial
-- incrementará o contador de interação da campanha.
-- ============================================================

CREATE OR REPLACE FUNCTION track_campaign_response()
RETURNS TRIGGER AS $$
DECLARE
    v_queue_id UUID;
    v_campaign_id UUID;
    v_user_phone VARCHAR;
    v_phone_clean VARCHAR;
    v_phone_no_55 VARCHAR;
    v_phone_with_55 VARCHAR;
    v_is_auto_reply BOOLEAN := FALSE;
    v_is_button_click BOOLEAN := FALSE;
    v_queue_metadata JSONB;
    v_text TEXT;
BEGIN
    -- 1. COMANDOS DE SISTEMA (ex: #reset, #teste, etc.):
    -- Retornam imediatamente, não representam resposta de campanha
    IF NEW.content IS NOT NULL AND trim(NEW.content) ~* '^#' THEN
        RETURN NEW;
    END IF;

    -- Processa apenas mensagens inbound de usuário
    IF NEW.sender_type = 'user' OR NEW.direction = 'inbound' THEN
        
        BEGIN
            -- Recupera o identificador do contato a partir da conversa
            SELECT user_identifier INTO v_user_phone
            FROM conversations
            WHERE id = NEW.conversation_id;

            IF v_user_phone IS NULL THEN
                RETURN NEW;
            END IF;

            -- Normalização para match indexado (com e sem código 55)
            v_phone_clean := regexp_replace(v_user_phone, '\D', '', 'g');
            v_phone_no_55 := regexp_replace(v_phone_clean, '^55', '');
            v_phone_with_55 := '55' || v_phone_no_55;

            -- Localiza o item correspondente na outbound_queue
            SELECT id, campaign_id, metadata INTO v_queue_id, v_campaign_id, v_queue_metadata
            FROM outbound_queue
            WHERE tenant_id = NEW.tenant_id
              AND contact_phone IN (v_user_phone, v_phone_clean, v_phone_with_55, v_phone_no_55)
              AND campaign_id IS NOT NULL
              AND (
                response_detected = FALSE
                OR COALESCE((metadata->>'is_auto_reply')::boolean, false) = TRUE
                OR COALESCE((metadata->>'is_bot')::boolean, false) = TRUE
                OR COALESCE((metadata->>'button_clicked')::boolean, false) = FALSE
              )
              AND status IN ('sent', 'delivered', 'read', 'processing')
            ORDER BY created_at DESC
            LIMIT 1;

            IF v_queue_id IS NOT NULL THEN
                v_text := COALESCE(NEW.content, '');
                
                -- 1. IDENTIFICAÇÃO ESTRITA DE CLIQUES EM BOTÕES FACTUAIS
                IF lower(trim(v_text)) IN (
                    'quero simular!', 'quero simular', 
                    'falar com um agente!', 'falar com um agente', 'falar com especialista',
                    'simular', 'simulação', 'simulacao',
                    'ver quanto posso ter', 'quanto posso ter',
                    'falar com agente (ia)', 'falar com agente', 'dúvidas – falar agente',
                    '✅ falar especialista', 'falar especialista', 'sim, falar com especialista', 'falar com um especialista'
                ) 
                OR (NEW.metadata->>'button_reply') IS NOT NULL 
                OR (NEW.metadata->>'interactive') IS NOT NULL THEN
                    v_is_button_click := TRUE;
                    v_is_auto_reply := FALSE;
                ELSE
                    -- Qualquer texto livre, saudação curta ("oi", "olá", "bom dia") ou auto-resposta NÃO conta como interação de campanha
                    v_is_button_click := FALSE;
                    
                    -- Detecção de auto-respostas para auditoria na fila
                    IF v_text ~* '(agradece(mos)? (seu contato|sua mensagem|a prefer[eê]ncia)|como podemos ajudar|como posso te ajudar|não est(ou|amos) dispon[ií]ve|não estamos funcionando|não está funcionando|funcionamos de .* [aà]s?|fora de hor[aá]rio|hor[aá]rio de atendimento|horário de funcionamento|hor[aá]rio comercial|estamos fechados|estará fechad[ao]|não abriremos|estamos de folga|acesse nosso cat[aá]logo|atendente foi solicitado|atendimento feito por pessoas|responderemos assim que poss[ií]vel|em breve retornaremos|retornaremos em breve|retornaremos assim que|retornaremos o contato|expediente foi encerrado|hora marcada|pedidos pelo whatsapp|para realizar seu pedido|para agilizar (o|seu) atendimento|agilizar o seu atendimento|para ser mais [aá]gil|endere[cç]o de entrega|AutoResponder|prezado(a)? cliente|voc[eê] est[aá] n[ao]|voc[eê] talvez busque|ordem de chegada|cobramos taxa|seja bem-vindo|seja bem-vinda|bem-vindo(a)? [aà]|obrigad[ao] pelo contato|obrigad[ao] pela compreens[aã]o|conheça nossas m[ií]dias|mensagem autom[aá]tica|resposta autom[aá]tica|atendimento autom[aá]tico|este canal [eé] exclusivo|este n[uú]mero (não recebe|não aceita) ligaç|bot d[aeo]|atendente virtual|assistente virtual|sou o bot|atendimento eletr[oô]nico|digite \*?[0-9]\*? (para|e conheça)|ap[oó]s o bip|card[aá]pio|fa[cç]a (já )?(o |seu )?pedido|quer fazer o pedido|pedidos? (apenas|somente) por liga[cç]|cardapioweb|beefood|menudin|beetech|99food|ifood|anota\.ai|est[aá] com fome|marmitex|marmitaria|adiante seu pedido|otimiza[cç][aã]o do tempo|valor da entrega|hor[aá]rio de entrega|facilite a sua compra|bem[- ]vindo ao |que bom te ver por aqui|o que voc[eê] est[aá] procurando|canal voltado apenas para fornecedores|plataformas de pedido|não tenho interesse|nao tenho interesse|sem interesse)' THEN
                        v_is_auto_reply := TRUE;
                    ELSE
                        v_is_auto_reply := FALSE;
                    END IF;
                END IF;

                -- Atualiza a fila com flags auditáveis
                UPDATE outbound_queue
                SET response_detected = TRUE,
                    metadata = jsonb_set(
                        jsonb_set(
                            jsonb_set(
                                jsonb_set(
                                    COALESCE(metadata, '{}'::jsonb),
                                    '{is_auto_reply}',
                                    to_jsonb(v_is_auto_reply)
                                ),
                                '{is_bot}',
                                to_jsonb(v_is_auto_reply)
                            ),
                            '{human_interaction}',
                            to_jsonb(v_is_button_click)
                        ),
                        '{button_clicked}',
                        to_jsonb(v_is_button_click)
                    )
                WHERE id = v_queue_id;

                -- Incrementa o contador da campanha ESTRITAMENTE para cliques factuais em botões que ainda não haviam clicado
                IF v_is_button_click AND COALESCE((v_queue_metadata->>'button_clicked')::boolean, false) = FALSE THEN
                    UPDATE campaigns
                    SET response_count = response_count + 1,
                        updated_at = NOW()
                    WHERE id = v_campaign_id;
                END IF;
                
            END IF;

        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Error in track_campaign_response trigger: %', SQLERRM;
        END;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Garante que o trigger está ativo na tabela messages
DROP TRIGGER IF EXISTS trg_track_campaign_response ON messages;
CREATE TRIGGER trg_track_campaign_response
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION track_campaign_response();
