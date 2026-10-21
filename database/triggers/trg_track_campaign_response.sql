-- Trigger to automatically track campaign responses when a user replies
-- Logic:
-- 1. Watch for INSERT on messages
-- 2. If sender_type is 'user' or direction is 'inbound'
-- 3. Match active outbound_queue item where response_detected is FALSE
-- 4. Mark response_detected = TRUE and increment campaign.response_count ONLY on valid human interaction / button click

CREATE OR REPLACE FUNCTION track_campaign_response()
RETURNS TRIGGER AS $$
DECLARE
    v_queue_id UUID;
    v_campaign_id UUID;
    v_user_phone VARCHAR;
    v_is_auto_reply BOOLEAN := FALSE;
    v_is_button_click BOOLEAN := FALSE;
    v_is_human_interaction BOOLEAN := FALSE;
    v_has_funnel_progress BOOLEAN := FALSE;
    v_text TEXT;
BEGIN
    -- Processa apenas mensagens inbound de usuário
    IF NEW.sender_type = 'user' OR NEW.direction = 'inbound' THEN
        
        BEGIN
            -- Recupera o identificador do contato a partir da conversa
            SELECT user_identifier INTO v_user_phone
            FROM conversations
            WHERE id = NEW.conversation_id;

            -- Localiza o item correspondente na outbound_queue
            SELECT id, campaign_id INTO v_queue_id, v_campaign_id
            FROM outbound_queue
            WHERE tenant_id = NEW.tenant_id
              AND (
                contact_phone = v_user_phone
                OR regexp_replace(contact_phone, '^55', '') = regexp_replace(v_user_phone, '^55', '')
              )
              AND campaign_id IS NOT NULL
              AND response_detected = FALSE
              AND status IN ('sent', 'delivered', 'read', 'processing')
            ORDER BY created_at DESC
            LIMIT 1;

            IF v_queue_id IS NOT NULL THEN
                v_text := COALESCE(NEW.content, '');
                
                -- 1. IDENTIFICAÇÃO DE CLIQUES EM BOTÕES (ESTRITAMENTE CLIQUES FACTUAIS NOS BOTÕES)
                IF lower(trim(v_text)) IN (
                    'quero simular!', 'quero simular', 
                    'falar com um agente!', 'falar com um agente', 'falar com especialista',
                    'simular', 'simulação', 'simulacao',
                    'ver quanto posso ter', 'quanto posso ter',
                    'falar com agente (ia)', 'falar com agente', 'dúvidas – falar agente',
                    '✅ sim, autorizo', 'sim, autorizo', 'autorizo',
                    '✅ falar especialista', 'falar especialista', 'sim, falar com especialista', 'falar com um especialista'
                ) 
                OR (NEW.metadata->>'button_reply') IS NOT NULL 
                OR (NEW.metadata->>'interactive') IS NOT NULL THEN
                    v_is_button_click := TRUE;
                    v_is_human_interaction := TRUE;
                    v_is_auto_reply := FALSE;
                ELSE
                    -- Qualquer texto avulso, saudação, mensagem de cardápio ou resposta livre NÃO conta como interação de campanha
                    v_is_button_click := FALSE;
                    v_is_human_interaction := FALSE;
                    
                    -- Detecção de auto-resposta apenas para auditoria de metadata na fila
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

                -- Incrementa o contador da campanha ESTRITAMENTE para cliques factuais em botões
                IF v_is_button_click THEN
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
