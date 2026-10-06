-- ============================================================
-- Migration: 20261006_expand_bot_detection_and_safeguarded_backfill.sql
-- Descrição:
-- 1. Expande o reconhecimento de respostas automáticas de robôs/secretárias eletrônicas
--    com foco em delivery, cardápios, URAs com digitação de opção, atendentes virtuais e boas-vindas.
-- 2. Atualiza a função track_campaign_response() e seu trigger em messages com salvaguardas estritas.
-- 3. Executa BACKFILL RETROATIVO SEGURO na outbound_queue:
--    - Marca is_auto_reply = true, is_bot = true e human_interaction = false para os robôs identificados.
--    - SALVAGUARDA ESTREITA: Preserva leads que clicaram em 'Quero simular' ou avançaram no funil
--      (identidade confirmada, faturamento informado, opt-in, crédito aprovado).
-- 4. Recalcula o contador de respostas válidas (response_count) nas campanhas afetadas.
-- ============================================================

-- 1. Atualiza a função do Trigger com Regex Completo e Expandido
CREATE OR REPLACE FUNCTION track_campaign_response()
RETURNS TRIGGER AS $$
DECLARE
    v_queue_id UUID;
    v_campaign_id UUID;
    v_user_phone VARCHAR;
    v_is_auto_reply BOOLEAN := FALSE;
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
                
                -- SALVAGUARDA 1: Cliques em botões do template NUNCA são auto-resposta
                IF lower(trim(v_text)) IN ('quero simular!', 'quero simular', 'falar com um agente!', 'falar com um agente', 'simular') THEN
                    v_is_auto_reply := FALSE;
                
                -- SALVAGUARDA 2: Se o lead já avançou em qualquer etapa anterior no agent_leads, NUNCA é auto-resposta
                ELSE
                    SELECT EXISTS (
                        SELECT 1 
                        FROM agent_leads al
                        WHERE al.campaign_id = v_campaign_id
                          AND (
                            al.whatsapp = v_user_phone
                            OR regexp_replace(al.whatsapp, '^55', '') = regexp_replace(v_user_phone, '^55', '')
                          )
                          AND (
                            (al.metadata->>'identity_confirmed') IN ('true', 't', '1')
                            OR (al.metadata->>'cnpj_confirmed') IN ('true', 't', '1')
                            OR (al.metadata->>'revenue') IS NOT NULL
                            OR (al.metadata->>'faturamento') IS NOT NULL
                            OR (al.metadata->>'opt_in')::boolean = true
                            OR (al.metadata->>'loan_request_id') IS NOT NULL
                          )
                    ) INTO v_has_funnel_progress;

                    IF v_has_funnel_progress THEN
                        v_is_auto_reply := FALSE;
                    -- Detecção Robusta e Abrangente de Auto-Resposta / Robôs de WhatsApp Business
                    ELSIF v_text ~* '(agradece seu contato|como podemos ajudar|como posso te ajudar|não est(ou|amos) dispon[ií]ve|não estamos funcionando|não está funcionando|funcionamos de .* [aà]s?|fora de hor[aá]rio|hor[aá]rio de atendimento|horário de funcionamento|hor[aá]rio comercial|estamos fechados|acesse nosso cat[aá]logo|atendente foi solicitado|atendimento feito por pessoas|responderemos assim que poss[ií]vel|em breve retornaremos|retornaremos em breve|retornaremos assim que|retornaremos o contato|expediente foi encerrado|hora marcada|pedidos pelo whatsapp|para realizar seu pedido|para agilizar (o|seu) atendimento|agilizar o seu atendimento|endere[cç]o de entrega|AutoResponder|prezado(a)? cliente|voc[eê] est[aá] n[ao]|voc[eê] talvez busque|ordem de chegada|cobramos taxa|seja bem-vindo|bem-vindo(a)? [aà]|obrigad[ao] pelo contato|obrigad[ao] pela compreens[aã]o|conheça nossas m[ií]dias|mensagem autom[aá]tica|resposta autom[aá]tica|atendimento autom[aá]tico|este canal [eé] exclusivo|este n[uú]mero (não recebe|não aceita) ligaç|bot d[aeo]|atendente virtual|assistente virtual|sou o bot|atendimento eletr[oô]nico|digite \*?[0-9]\*? (para|e conheça)|ap[oó]s o bip|card[aá]pio|fa[cç]a (já )?(o |seu )?pedido|quer fazer o pedido|pedidos? (apenas|somente) por liga[cç]|cardapioweb|beefood|menudin|beetech|99food|ifood|anota\.ai|est[aá] com fome|marmitex|adiante seu pedido|otimiza[cç][aã]o do tempo|valor da entrega|hor[aá]rio de entrega|facilite a sua compra|bem[- ]vindo ao |que bom te ver por aqui|o que voc[eê] est[aá] procurando|canal voltado apenas para fornecedores|plataformas de pedido)' THEN
                        v_is_auto_reply := TRUE;
                    ELSE
                        -- Em dúvida: registra como humano
                        v_is_auto_reply := FALSE;
                    END IF;
                END IF;

                -- Atualiza a fila com a flag auditável
                UPDATE outbound_queue
                SET response_detected = TRUE,
                    metadata = jsonb_set(
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
                        to_jsonb(NOT v_is_auto_reply)
                    )
                WHERE id = v_queue_id;

                -- Incrementa o contador de respostas válidas apenas se for humano
                IF NOT v_is_auto_reply THEN
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

-- Garante que o trigger está ativo
DROP TRIGGER IF EXISTS trg_track_campaign_response ON messages;
CREATE TRIGGER trg_track_campaign_response
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION track_campaign_response();

-- ============================================================
-- 2. BACKFILL RETROATIVO SEGURO
-- ============================================================
-- Identifica as mensagens de auto-resposta/robô
WITH bot_conversations AS (
    SELECT DISTINCT m.conversation_id
    FROM messages m
    WHERE (m.sender_type = 'user' OR m.direction = 'inbound')
      AND m.content ~* '(agradece seu contato|como podemos ajudar|como posso te ajudar|não est(ou|amos) dispon[ií]ve|não estamos funcionando|não está funcionando|funcionamos de .* [aà]s?|fora de hor[aá]rio|hor[aá]rio de atendimento|horário de funcionamento|hor[aá]rio comercial|estamos fechados|acesse nosso cat[aá]logo|atendente foi solicitado|atendimento feito por pessoas|responderemos assim que poss[ií]vel|em breve retornaremos|retornaremos em breve|retornaremos assim que|retornaremos o contato|expediente foi encerrado|hora marcada|pedidos pelo whatsapp|para realizar seu pedido|para agilizar (o|seu) atendimento|agilizar o seu atendimento|endere[cç]o de entrega|AutoResponder|prezado(a)? cliente|voc[eê] est[aá] n[ao]|voc[eê] talvez busque|ordem de chegada|cobramos taxa|seja bem-vindo|bem-vindo(a)? [aà]|obrigad[ao] pelo contato|obrigad[ao] pela compreens[aã]o|conheça nossas m[ií]dias|mensagem autom[aá]tica|resposta autom[aá]tica|atendimento autom[aá]tico|este canal [eé] exclusivo|este n[uú]mero (não recebe|não aceita) ligaç|bot d[aeo]|atendente virtual|assistente virtual|sou o bot|atendimento eletr[oô]nico|digite \*?[0-9]\*? (para|e conheça)|ap[oó]s o bip|card[aá]pio|fa[cç]a (já )?(o |seu )?pedido|quer fazer o pedido|pedidos? (apenas|somente) por liga[cç]|cardapioweb|beefood|menudin|beetech|99food|ifood|anota\.ai|est[aá] com fome|marmitex|adiante seu pedido|otimiza[cç][aã]o do tempo|valor da entrega|hor[aá]rio de entrega|facilite a sua compra|bem[- ]vindo ao |que bom te ver por aqui|o que voc[eê] est[aá] procurando|canal voltado apenas para fornecedores|plataformas de pedido)'
      -- Salvaguarda: NUNCA se o usuário também clicou em simulação
      AND NOT EXISTS (
          SELECT 1 
          FROM messages m2
          WHERE m2.conversation_id = m.conversation_id
            AND lower(trim(m2.content)) IN ('quero simular!', 'quero simular', 'falar com um agente!', 'falar com um agente', 'simular')
      )
)
UPDATE outbound_queue oq
SET metadata = jsonb_set(
    jsonb_set(
        jsonb_set(
            COALESCE(oq.metadata, '{}'::jsonb),
            '{is_auto_reply}',
            'true'::jsonb
        ),
        '{is_bot}',
        'true'::jsonb
    ),
    '{human_interaction}',
    'false'::jsonb
)
FROM bot_conversations bc
WHERE oq.conversation_id = bc.conversation_id
  AND COALESCE(oq.response_detected, false) = true
  AND NOT EXISTS (
    -- SALVAGUARDA ABSOLUTA: NUNCA marca se o lead avançou em qualquer etapa do funil
    SELECT 1 
    FROM agent_leads al
    WHERE al.campaign_id = oq.campaign_id
      AND (
        al.whatsapp = oq.contact_phone 
        OR regexp_replace(al.whatsapp, '^55', '') = regexp_replace(oq.contact_phone, '^55', '')
      )
      AND (
        (al.metadata->>'identity_confirmed') IN ('true', 't', '1')
        OR (al.metadata->>'cnpj_confirmed') IN ('true', 't', '1')
        OR (al.metadata->>'revenue') IS NOT NULL
        OR (al.metadata->>'faturamento') IS NOT NULL
        OR (al.metadata->>'opt_in')::boolean = true
        OR (al.metadata->>'optin')::boolean = true
        OR (al.metadata->'consent'->>'opt_in')::boolean = true
        OR (al.metadata->>'loan_request_id') IS NOT NULL
        OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('approved', 'in_quoting', 'comite_approved')
      )
  );

-- ============================================================
-- 3. Recalcula response_count nas campanhas ativas
-- ============================================================
WITH accurate_counts AS (
    SELECT 
        campaign_id,
        COUNT(id) FILTER (
            WHERE response_detected = true 
              AND COALESCE((metadata->>'is_auto_reply')::boolean, false) = false
              AND COALESCE((metadata->>'is_bot')::boolean, false) = false
        ) AS valid_responses
    FROM outbound_queue
    WHERE campaign_id IS NOT NULL
    GROUP BY campaign_id
)
UPDATE campaigns c
SET response_count = ac.valid_responses,
    updated_at = NOW()
FROM accurate_counts ac
WHERE c.id = ac.campaign_id
  AND c.status IN ('active', 'running', 'processing', 'completed');
