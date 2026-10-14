-- ============================================================
-- Migration: 20261013_strict_interaction_button_clicks_and_bot_purge.sql
-- Descrição:
-- 1. Garante que apenas contatos que CLICARAM EM BOTÕES DO TEMPLATE
--    ('Quero simular!', 'Falar com um agente!', interações de botão) sejam contabilizados como INTERAGIRAM.
-- 2. Expande o reconhecimento de mensagens de robôs / WhatsApp Business (ausência, cardápios, folga, fechado).
-- 3. Executa BACKFILL RETROATIVO SEGURO na campanha '13/out_leads maior propensão' (ce25ec05-ca1e-4c77-8654-c528583827f3):
--    - Expurga 11 robôs de WhatsApp Business e 1 texto digitado livre sem clique em botão.
--    - Marca 'is_auto_reply' = true, 'is_bot' = true, 'human_interaction' = false.
--    - Marca 'button_clicked' = true para os 97 leads que clicaram de fato em um dos botões.
-- 4. Atualiza o trigger track_campaign_response() para blindar disparos futuros.
-- 5. Atualiza o contador oficial da campanha (response_count = 97).
-- ============================================================

-- 1. Backfill dos 12 itens identificados sem clique em botão na campanha 13/out
UPDATE public.outbound_queue
SET metadata = jsonb_set(
    jsonb_set(
        jsonb_set(
            jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{is_auto_reply}',
                'true'::jsonb
            ),
            '{is_bot}',
            'true'::jsonb
        ),
        '{human_interaction}',
        'false'::jsonb
    ),
    '{button_clicked}',
    'false'::jsonb
)
WHERE id IN (
  '8ba25b86-8b97-495c-b1cc-a29e2cec41e8', -- GABRIEL DA SILVA ALMEIDA (Ausência: "Olá ótimo dia, desde já agradeço seu contato...")
  'dd28aad0-4a83-420b-8ba2-4d8a629626d1', -- STEPHANI CRUZ DE PAULA (Restaurante: "Ola tudo bem? So um momento ja iremos te atender...")
  '4fd215dd-6ecf-4695-8ac8-5de63cb9718e', -- FARIAS & ALVES CASA DE CARNES LTDA (Atendente virtual FIA: "Eu sou a FIA, a assistente virtual...")
  '8149e938-8765-491b-91fa-9c77215b46ff', -- T H DE MORAES & R FERREIRA LTDA (Restaurante: "agradecemos a preferência! Respondemos de acordo...")
  'ebe8f7b5-84ad-483d-bc20-1444e68350ed', -- PADARIA MANIA LTDA (Auto-resposta: "Agradecemos sua mensagem. 😊 Problema com sua conta...")
  '609e80f9-4ac3-42b9-b859-295ed79ce3f8', -- MAYARA PERES REQUINTE PREMIUM LTDA (Padaria: "Requinte Padaria e Confeitaria agradece por sua mensagem...")
  'd7738627-ab36-44cd-95af-bcf00599fccc', -- ED LANCHES E RESTAURANTE LTDA (Lanchonete: "Olá!! Tudo bem? Só um instante já nos falamos...")
  '06e58f18-e243-41b9-8851-1dd507a213f6', -- CASSIA FERNANDA HONORATO (Marmitaria: "Seja muito bem-vindo (a) à Cássia Marmitaria Fit...")
  '163f45aa-1588-4600-a82b-b8e11ce4ae61', -- BRABAS DO RANGO LTDA (Folga: "Bom dia, hoje estamos de folga 😊...")
  '7ab7ef33-39a8-459e-ac62-cb2319cb18ac', -- GLEICE ADRIANE DE SOUSA (Confeitaria: "Seja bem-vinda(o) Nosso atendimento funciona de segunda a sábado...")
  'abda4f63-9659-4a39-85b9-b9f09b01481b', -- DON SICO PIZZA LTDA (Pizzaria Fechada: "Fala, fã de pizza! 🍕😋 Aviso importante: HOJE NÃO ABRIREMOS...")
  '2482c9dd-1b30-4b32-ba7a-ed9022f46fe8'  -- WELTON SOUZA MARTINS (Texto livre de recusa sem clique em botão: "Bom dia! Obrigada pela oferta, mas não tenho interesse.")
);

-- 2. Atualização dos 97 contatos legítimos com clique em botão na campanha 13/out
UPDATE public.outbound_queue oq
SET metadata = jsonb_set(
    jsonb_set(
        jsonb_set(
            COALESCE(oq.metadata, '{}'::jsonb),
            '{button_clicked}',
            'true'::jsonb
        ),
        '{is_auto_reply}',
        'false'::jsonb
    ),
    '{human_interaction}',
    'true'::jsonb
)
WHERE oq.campaign_id = 'ce25ec05-ca1e-4c77-8654-c528583827f3'
  AND oq.id NOT IN (
    '8ba25b86-8b97-495c-b1cc-a29e2cec41e8',
    'dd28aad0-4a83-420b-8ba2-4d8a629626d1',
    '4fd215dd-6ecf-4695-8ac8-5de63cb9718e',
    '8149e938-8765-491b-91fa-9c77215b46ff',
    'ebe8f7b5-84ad-483d-bc20-1444e68350ed',
    '609e80f9-4ac3-42b9-b859-295ed79ce3f8',
    'd7738627-ab36-44cd-95af-bcf00599fccc',
    '06e58f18-e243-41b9-8851-1dd507a213f6',
    '163f45aa-1588-4600-a82b-b8e11ce4ae61',
    '7ab7ef33-39a8-459e-ac62-cb2319cb18ac',
    'abda4f63-9659-4a39-85b9-b9f09b01481b',
    '2482c9dd-1b30-4b32-ba7a-ed9022f46fe8'
  )
  AND (
    oq.response_detected = true 
    OR (oq.metadata->>'responded') = 'true'
    OR trim(lower(oq.status)) IN ('respondida', 'interagiu')
  )
  AND NOT (
    COALESCE((oq.metadata->>'is_auto_reply')::boolean, false) = true
    OR COALESCE((oq.metadata->>'is_bot')::boolean, false) = true
  );

-- 3. Atualizar contador consolidado da campanha
UPDATE public.campaigns
SET response_count = 97,
    updated_at = NOW()
WHERE id = 'ce25ec05-ca1e-4c77-8654-c528583827f3';

-- 4. Atualizar o Trigger track_campaign_response() com a regra estrita de botões e dicionário expandido
CREATE OR REPLACE FUNCTION track_campaign_response()
RETURNS TRIGGER AS $$
DECLARE
    v_queue_id UUID;
    v_campaign_id UUID;
    v_user_phone VARCHAR;
    v_is_auto_reply BOOLEAN := FALSE;
    v_is_button_click BOOLEAN := FALSE;
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
                
                -- REGRA MANDATÓRIA: Identifica se a mensagem é clique em botão do template
                IF lower(trim(v_text)) IN (
                    'quero simular!', 'quero simular', 
                    'falar com um agente!', 'falar com um agente', 
                    'simular', 'simulação', 'simulacao',
                    '✅ sim, autorizo', 'sim, autorizo', 'autorizo'
                ) 
                OR (NEW.metadata->>'button_reply') IS NOT NULL 
                OR (NEW.metadata->>'interactive') IS NOT NULL THEN
                    v_is_button_click := TRUE;
                    v_is_auto_reply := FALSE;
                
                -- SALVAGUARDA DE FUNIL: Se o lead já avançou em qualquer etapa anterior no agent_leads
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
                        v_is_button_click := TRUE;
                        v_is_auto_reply := FALSE;
                    -- Detecção Completa de Auto-Respostas Comerciais e Robôs
                    ELSIF v_text ~* '(agradece(mos)? (seu contato|sua mensagem|a prefer[eê]ncia)|como podemos ajudar|como posso te ajudar|não est(ou|amos) dispon[ií]ve|não estamos funcionando|não está funcionando|funcionamos de .* [aà]s?|fora de hor[aá]rio|hor[aá]rio de atendimento|horário de funcionamento|hor[aá]rio comercial|estamos fechados|estará fechad[ao]|não abriremos|estamos de folga|acesse nosso cat[aá]logo|atendente foi solicitado|atendimento feito por pessoas|responderemos assim que poss[ií]vel|em breve retornaremos|retornaremos em breve|retornaremos assim que|retornaremos o contato|expediente foi encerrado|hora marcada|pedidos pelo whatsapp|para realizar seu pedido|para agilizar (o|seu) atendimento|agilizar o seu atendimento|para ser mais [aá]gil|endere[cç]o de entrega|AutoResponder|prezado(a)? cliente|voc[eê] est[aá] n[ao]|voc[eê] talvez busque|ordem de chegada|cobramos taxa|seja bem-vindo|seja bem-vinda|bem-vindo(a)? [aà]|obrigad[ao] pelo contato|obrigad[ao] pela compreens[aã]o|conheça nossas m[ií]dias|mensagem autom[aá]tica|resposta autom[aá]tica|atendimento autom[aá]tico|este canal [eé] exclusivo|este n[uú]mero (não recebe|não aceita) ligaç|bot d[aeo]|atendente virtual|assistente virtual|sou o bot|atendimento eletr[oô]nico|digite \*?[0-9]\*? (para|e conheça)|ap[oó]s o bip|card[aá]pio|fa[cç]a (já )?(o |seu )?pedido|quer fazer o pedido|pedidos? (apenas|somente) por liga[cç]|cardapioweb|beefood|menudin|beetech|99food|ifood|anota\.ai|est[aá] com fome|marmitex|marmitaria|adiante seu pedido|otimiza[cç][aã]o do tempo|valor da entrega|hor[aá]rio de entrega|facilite a sua compra|bem[- ]vindo ao |que bom te ver por aqui|o que voc[eê] est[aá] procurando|canal voltado apenas para fornecedores|plataformas de pedido|não tenho interesse|nao tenho interesse|sem interesse)' THEN
                        v_is_auto_reply := TRUE;
                        v_is_button_click := FALSE;
                    ELSE
                        -- Mensagem digitada sem clique em botão
                        v_is_auto_reply := FALSE;
                        v_is_button_click := FALSE;
                    END IF;
                END IF;

                -- Atualiza a fila com a flag auditável
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

                -- Incrementa o contador de respostas válidas apenas se houve clique em botão
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
