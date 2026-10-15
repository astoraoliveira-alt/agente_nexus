-- ============================================================
-- Migration: 20261015_optimize_reset_and_track_campaign_response.sql
-- Descrição:
-- 1. Elimina timeout no #reset e em mensagens concorrentes:
--    a) Ignora imediatamente comandos de sistema (^#) no track_campaign_response,
--       evitando varredura pesada e desnecessária na outbound_queue (127k+ linhas).
--    b) Substitui comparação funcional 'regexp_replace(contact_phone, ...)' por
--       busca indexada direta 'contact_phone IN (com 55, sem 55)', acelerando
--       em mais de 100x a resposta a mensagens normais de campanha.
--    c) Cria índice condicional otimizado na outbound_queue para response_detected = FALSE.
--    d) Otimiza a RPC record_message para ignorar busca de mídia em comandos ^#
--       e garantir resolução ágil de locks na inbound_queue.
-- ============================================================

-- 1. Índice de ultra-performance na outbound_queue para respostas de campanha pendentes
CREATE INDEX IF NOT EXISTS idx_outbound_queue_campaign_response_fast
ON public.outbound_queue (tenant_id, contact_phone, created_at DESC)
WHERE response_detected = FALSE;

-- 2. Atualização otimizada da função track_campaign_response()
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
    v_is_human_interaction BOOLEAN := FALSE;
    v_has_funnel_progress BOOLEAN := FALSE;
    v_queue_metadata JSONB;
    v_text TEXT;
BEGIN
    -- 1. COMANDOS DE SISTEMA (ex: #reset, #teste, etc.):
    -- Devem retornar imediatamente, pois não representam resposta de lead a campanhas
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

            -- Normalização ágil para match indexado (com e sem código 55)
            v_phone_clean := regexp_replace(v_user_phone, '\D', '', 'g');
            v_phone_no_55 := regexp_replace(v_phone_clean, '^55', '');
            v_phone_with_55 := '55' || v_phone_no_55;

            -- Localiza o item correspondente na outbound_queue usando busca indexada
            -- Permite capturar linhas pendentes OU linhas anteriormente marcadas como auto-reply para promover a humana
            SELECT id, campaign_id, metadata INTO v_queue_id, v_campaign_id, v_queue_metadata
            FROM outbound_queue
            WHERE tenant_id = NEW.tenant_id
              AND contact_phone IN (v_user_phone, v_phone_clean, v_phone_with_55, v_phone_no_55)
              AND campaign_id IS NOT NULL
              AND (
                response_detected = FALSE
                OR COALESCE((metadata->>'is_auto_reply')::boolean, false) = TRUE
                OR COALESCE((metadata->>'is_bot')::boolean, false) = TRUE
              )
              AND status IN ('sent', 'delivered', 'read', 'processing')
            ORDER BY created_at DESC
            LIMIT 1;

            IF v_queue_id IS NOT NULL THEN
                v_text := COALESCE(NEW.content, '');
                
                -- 1. IDENTIFICAÇÃO DE CLIQUES EM BOTÕES (ATUAIS E FIM DE ANO)
                IF lower(trim(v_text)) IN (
                    'quero simular!', 'quero simular', 
                    'falar com um agente!', 'falar com um agente', 'falar com especialista',
                    'simular', 'simulação', 'simulacao',
                    'ver quanto posso ter', 'quanto posso ter',
                    'falar com agente (ia)', 'falar com agente', 'dúvidas – falar agente',
                    '✅ sim, autorizo', 'sim, autorizo', 'autorizo'
                ) 
                OR (NEW.metadata->>'button_reply') IS NOT NULL 
                OR (NEW.metadata->>'interactive') IS NOT NULL THEN
                    v_is_button_click := TRUE;
                    v_is_human_interaction := TRUE;
                    v_is_auto_reply := FALSE;
                
                -- 2. IDENTIFICAÇÃO DE MENSAGENS SIMPLES E CLARAS DO LEAD (SAUDAÇÕES CURTAS HUMANAS)
                ELSIF length(trim(v_text)) <= 30 AND lower(trim(v_text)) ~* '^(oi|ol[aá]|oie|opa|bom dia|boa tarde|boa noite|sim|ok|pode|quero|tenho interesse|gostaria|show|beleza|claro)[!.,\s]*$' THEN
                    v_is_button_click := FALSE;
                    v_is_human_interaction := TRUE;
                    v_is_auto_reply := FALSE;

                -- 3. SALVAGUARDA DE FUNIL: Se o lead já avançou em qualquer etapa anterior no agent_leads
                ELSE
                    SELECT EXISTS (
                        SELECT 1 
                        FROM agent_leads al
                        WHERE al.campaign_id = v_campaign_id
                          AND al.whatsapp IN (v_user_phone, v_phone_clean, v_phone_with_55, v_phone_no_55)
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
                        v_is_button_click := FALSE;
                        v_is_human_interaction := TRUE;
                        v_is_auto_reply := FALSE;
                    -- 4. Detecção Completa de Auto-Respostas Comerciais e Robôs
                    ELSIF v_text ~* '(agradece(mos)? (seu contato|sua mensagem|a prefer[eê]ncia)|como podemos ajudar|como posso te ajudar|não est(ou|amos) dispon[ií]ve|não estamos funcionando|não está funcionando|funcionamos de .* [aà]s?|fora de hor[aá]rio|hor[aá]rio de atendimento|horário de funcionamento|hor[aá]rio comercial|estamos fechados|estará fechad[ao]|não abriremos|estamos de folga|acesse nosso cat[aá]logo|atendente foi solicitado|atendimento feito por pessoas|responderemos assim que poss[ií]vel|em breve retornaremos|retornaremos em breve|retornaremos assim que|retornaremos o contato|expediente foi encerrado|hora marcada|pedidos pelo whatsapp|para realizar seu pedido|para agilizar (o|seu) atendimento|agilizar o seu atendimento|para ser mais [aá]gil|endere[cç]o de entrega|AutoResponder|prezado(a)? cliente|voc[eê] est[aá] n[ao]|voc[eê] talvez busque|ordem de chegada|cobramos taxa|seja bem-vindo|seja bem-vinda|bem-vindo(a)? [aà]|obrigad[ao] pelo contato|obrigad[ao] pela compreens[aã]o|conheça nossas m[ií]dias|mensagem autom[aá]tica|resposta autom[aá]tica|atendimento autom[aá]tico|este canal [eé] exclusivo|este n[uú]mero (não recebe|não aceita) ligaç|bot d[aeo]|atendente virtual|assistente virtual|sou o bot|atendimento eletr[oô]nico|digite \*?[0-9]\*? (para|e conheça)|ap[oó]s o bip|card[aá]pio|fa[cç]a (já )?(o |seu )?pedido|quer fazer o pedido|pedidos? (apenas|somente) por liga[cç]|cardapioweb|beefood|menudin|beetech|99food|ifood|anota\.ai|est[aá] com fome|marmitex|marmitaria|adiante seu pedido|otimiza[cç][aã]o do tempo|valor da entrega|hor[aá]rio de entrega|facilite a sua compra|bem[- ]vindo ao |que bom te ver por aqui|o que voc[eê] est[aá] procurando|canal voltado apenas para fornecedores|plataformas de pedido|não tenho interesse|nao tenho interesse|sem interesse)' THEN
                        v_is_auto_reply := TRUE;
                        v_is_button_click := FALSE;
                        v_is_human_interaction := FALSE;
                    ELSE
                        -- Mensagem digitada pelo usuário não coincidente com robôs: Interação humana legítima
                        v_is_auto_reply := FALSE;
                        v_is_button_click := FALSE;
                        v_is_human_interaction := TRUE;
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
                            to_jsonb(v_is_human_interaction)
                        ),
                        '{button_clicked}',
                        to_jsonb(v_is_button_click)
                    )
                WHERE id = v_queue_id;

                -- Incrementa o contador da campanha apenas para novas interações humanas válidas
                IF v_is_human_interaction AND COALESCE((v_queue_metadata->>'human_interaction')::boolean, false) = FALSE THEN
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

-- 3. Atualização otimizada de record_message
CREATE OR REPLACE FUNCTION public.record_message(
    p_conversation_id UUID,
    p_tenant_id       UUID,
    p_content         TEXT    DEFAULT NULL,
    p_sender_type     TEXT    DEFAULT 'user',
    p_sender_name     TEXT    DEFAULT NULL,
    p_message_type    TEXT    DEFAULT 'text',
    p_trace_id        TEXT    DEFAULT NULL,
    p_metadata        JSONB   DEFAULT '{}'::jsonb,
    p_remote_id       TEXT    DEFAULT NULL,
    p_file_url        TEXT    DEFAULT NULL,
    p_transcription   TEXT    DEFAULT NULL,
    p_direction       TEXT    DEFAULT NULL,
    p_external_id     TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_direction      TEXT;
    v_is_outbound    BOOLEAN;
    v_content        TEXT := p_content;
    v_message_type   TEXT := COALESCE(p_message_type, 'text');
    v_file_url       TEXT := p_file_url;
    v_audio_url      TEXT := NULL;
    v_image_url      TEXT := NULL;
    v_file_name      TEXT := NULL;
    v_file_mime      TEXT := NULL;
    v_queue_media    RECORD;
    v_is_system_cmd  BOOLEAN := FALSE;
BEGIN
    -- 1. Lógica de direção original
    v_direction := COALESCE(p_direction, CASE WHEN p_sender_type = 'user' THEN 'inbound' ELSE 'outbound' END);
    v_is_outbound := (v_direction = 'outbound');

    -- Verifica se é comando de sistema (^#)
    IF v_content IS NOT NULL AND trim(v_content) ~* '^#' THEN
        v_is_system_cmd := TRUE;
    END IF;

    -- Extrai metadados existentes caso já venham no p_metadata
    v_file_name := p_metadata->>'file_name';
    v_file_mime := p_metadata->>'mime_type';

    -- 2. 🛡️ AUTO-RECUPERAÇÃO DE MÍDIA INBOUND (Apenas se não for comando de sistema e não tiver mídia)
    IF p_sender_type = 'user' AND (v_file_url IS NULL OR v_message_type = 'text') AND NOT v_is_system_cmd THEN
        SELECT 
            q.payload->>'mediaUrl' AS media_url,
            COALESCE(q.payload->>'messageType', q.message_type) AS msg_type,
            q.payload->>'fileName' AS file_name,
            q.payload->>'fileMimeType' AS file_mime
        INTO v_queue_media
        FROM public.inbound_queue q
        WHERE (q.external_id = COALESCE(p_external_id, p_remote_id) OR q.trace_id = p_trace_id)
          AND q.payload->>'mediaUrl' IS NOT NULL
        ORDER BY q.created_at DESC
        LIMIT 1;

        IF v_queue_media.media_url IS NOT NULL THEN
            v_file_url := v_queue_media.media_url;
            v_file_name := COALESCE(v_file_name, v_queue_media.file_name);
            v_file_mime := COALESCE(v_file_mime, v_queue_media.file_mime);

            IF v_file_mime ILIKE '%image%' OR v_file_name ~* '\.(jpe?g|png|gif|webp)$' OR v_queue_media.msg_type = 'image' THEN
                v_message_type := 'image';
            ELSIF v_file_mime ILIKE '%audio%' OR v_file_name ~* '\.(oga|ogg|mp3|wav|m4a)$' OR v_queue_media.msg_type = 'audio' THEN
                v_message_type := 'audio';
            ELSIF v_file_mime ILIKE '%pdf%' OR v_file_mime ILIKE '%document%' OR v_file_mime ILIKE '%sheet%' OR v_file_name ~* '\.(pdf|docx?|xlsx?|csv|zip)$' OR v_queue_media.msg_type = 'document' THEN
                v_message_type := 'document';
            ELSE
                v_message_type := COALESCE(v_queue_media.msg_type, 'document');
            END IF;

            IF v_content IS NULL OR trim(v_content) = '' THEN
                v_content := CASE 
                    WHEN v_message_type = 'audio' THEN '[Áudio recebido]'
                    WHEN v_message_type = 'image' THEN '[Imagem recebida]'
                    WHEN v_message_type = 'document' AND v_file_name IS NOT NULL THEN 'Documento: ' || v_file_name
                    ELSE '[Documento recebido]'
                END;
            END IF;
        END IF;
    END IF;

    -- Define URLs específicas por tipo
    IF v_message_type = 'audio' THEN
        v_audio_url := v_file_url;
    ELSIF v_message_type = 'image' THEN
        v_image_url := v_file_url;
    END IF;

    -- 3. Inserção com Idempotência
    INSERT INTO public.messages (
        conversation_id, tenant_id, content, sender_type, sender_name,
        message_type, audio_url, image_url, trace_id, metadata, 
        remote_id, external_id, direction
    ) VALUES (
        p_conversation_id, p_tenant_id, public.clean_message_content(v_content),
        p_sender_type, p_sender_name, v_message_type, v_audio_url, v_image_url, p_trace_id,
        p_metadata || jsonb_build_object(
            'file_url', v_file_url,
            'file_name', v_file_name,
            'mime_type', v_file_mime,
            'transcription', p_transcription
        ),
        p_remote_id,
        COALESCE(p_external_id, p_remote_id),
        v_direction
    )
    ON CONFLICT (tenant_id, external_id) DO NOTHING;

    -- 4. Atualização da Conversa
    UPDATE public.conversations
    SET last_message_at = NOW(),
        updated_at      = NOW()
    WHERE id = p_conversation_id;

    -- 5. Limpeza de fila + marca reply_sent quando for resposta do agente
    IF p_trace_id IS NOT NULL OR p_external_id IS NOT NULL OR p_remote_id IS NOT NULL THEN
        UPDATE public.inbound_queue
        SET
            status       = 'done',
            processed_at = NOW(),
            reply_sent    = CASE WHEN v_is_outbound THEN TRUE  ELSE reply_sent    END,
            reply_sent_at = CASE WHEN v_is_outbound THEN NOW() ELSE reply_sent_at END
        WHERE external_id = COALESCE(p_external_id, p_remote_id)
           OR trace_id    = p_trace_id;
    END IF;

    -- 6. Retorno esperado pelo N8N
    RETURN jsonb_build_object('status', 'success', 'direction', v_direction, 'message_type', v_message_type);
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.record_message(uuid, uuid, text, text, text, text, text, jsonb, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_message(uuid, uuid, text, text, text, text, text, jsonb, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_message(uuid, uuid, text, text, text, text, text, jsonb, text, text, text, text, text) TO anon;

-- ============================================================
-- 4. RPC get_credit_campaign_funnel_stats com Invariante de Funil
-- ============================================================
DROP FUNCTION IF EXISTS get_credit_campaign_funnel_stats(UUID, UUID[], TIMESTAMP WITH TIME ZONE, UUID);

CREATE OR REPLACE FUNCTION get_credit_campaign_funnel_stats(
  p_tenant_id UUID, 
  p_campaign_ids UUID[] DEFAULT NULL,
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_agent_id UUID DEFAULT NULL
)
RETURNS TABLE (
  campaign_id UUID,
  campaign_name TEXT,
  start_date TIMESTAMP WITH TIME ZONE,
  status TEXT,
  -- Bloco 1: Envio da Campanha
  carregados BIGINT,
  enviados BIGINT,
  entregues BIGINT,
  lidas BIGINT,
  interagiram BIGINT,
  -- Bloco 2: Funil de Venda
  confirmaram BIGINT,
  faturamento BIGINT,
  valor_inicial BIGINT,
  opt_in BIGINT,
  aprovados BIGINT,
  recusados BIGINT,
  simularam BIGINT,
  ok_agente BIGINT,
  -- Bloco 3: Funil de Formalização
  aguar_contato BIGINT,
  em_atendimento BIGINT,
  formalizado BIGINT,
  desistencia BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH oq_metrics AS (
    SELECT
      c.id AS cid,
      c.name::text AS cname,
      COALESCE(c.start_date::timestamptz, c.created_at) AS cstart_date,
      c.status::text AS cstatus,
      COUNT(oq.id) AS m_carregados,
      COUNT(oq.id) FILTER (
        WHERE trim(lower(oq.status)) NOT IN ('queued', 'pending', 'scheduled', 'draft')
           OR COALESCE(oq.response_detected, false) = true
           OR trim(lower(oq.status)) = 'converted'
           OR (oq.metadata->>'converted') = 'true'
           OR oq.sent_at IS NOT NULL
      ) AS m_enviados,
      COUNT(oq.id) FILTER (
        WHERE trim(lower(oq.status)) IN ('sent', 'enviada', 'delivered', 'read', 'respondida', 'convertida', 'entregue', 'lida', 'recebida', 'interagiu')
           OR COALESCE(oq.response_detected, false) = true
           OR trim(lower(oq.status)) = 'converted'
           OR (oq.metadata->>'converted') = 'true'
      ) AS m_entregues,
      COUNT(oq.id) FILTER (
        WHERE trim(lower(oq.status)) IN ('read', 'respondida', 'convertida', 'lida', 'recebida', 'interagiu')
           OR COALESCE(oq.response_detected, false) = true
           OR trim(lower(oq.status)) = 'converted'
           OR (oq.metadata->>'converted') = 'true'
      ) AS m_lidas,
      -- ============================================================
      -- INTERAGIRAM COM EXPURGO DE ROBÔS E GARANTIA DE INTERAÇÃO
      -- ============================================================
      COUNT(oq.id) FILTER (
        WHERE (
          COALESCE(oq.response_detected, false) = true
          OR (oq.metadata->>'responded') = 'true'
          OR trim(lower(oq.status)) IN ('respondida', 'interagiu')
          OR COALESCE((oq.metadata->>'human_interaction')::boolean, false) = true
        )
        -- REGRA DE EXCLUSÃO: Só descarta se explicitamente marcado como robô/auto-resposta
        -- E com a garantia de que NUNCA descarta se o lead teve interação humana confirmada
        AND NOT (
          (COALESCE((oq.metadata->>'is_auto_reply')::boolean, false) = true
           OR COALESCE((oq.metadata->>'is_bot')::boolean, false) = true)
          AND COALESCE((oq.metadata->>'human_interaction')::boolean, false) = false
        )
      ) AS m_interagiram
    FROM campaigns c
    LEFT JOIN outbound_queue oq ON oq.campaign_id = c.id
    WHERE c.tenant_id = p_tenant_id
      AND (p_campaign_ids IS NULL OR array_length(p_campaign_ids, 1) IS NULL OR c.id = ANY(p_campaign_ids))
      AND (p_start_date IS NULL OR c.created_at >= p_start_date)
      AND (p_agent_id IS NULL OR c.agent_id = p_agent_id)
    GROUP BY c.id, c.name, c.start_date, c.created_at, c.status
  ),
  lead_metrics AS (
    SELECT
      al.campaign_id AS l_cid,
      -- Bloco 2: Funil de Venda (Hierarquia Estrita do Funil)
      
      -- 1. Confirmaram: Confirmou identidade OU avançou em qualquer etapa posterior
      COUNT(al.id) FILTER (
        WHERE (al.metadata->>'identity_confirmed') IN ('true', 't', '1')
           OR (al.metadata->>'cnpj_confirmed') IN ('true', 't', '1')
           OR (
             (al.metadata->>'requested_amount') ~ '^[0-9]+(\.[0-9]+)?$' 
             AND length(regexp_replace(al.metadata->>'requested_amount', '\..*$', '')) <= 6
             AND (al.metadata->>'requested_amount')::numeric BETWEEN 10000 AND 500000
           )
           OR (
             (al.metadata->>'valor_inicial') ~ '^[0-9]+(\.[0-9]+)?$' 
             AND length(regexp_replace(al.metadata->>'valor_inicial', '\..*$', '')) <= 6
             AND (al.metadata->>'valor_inicial')::numeric BETWEEN 10000 AND 500000
           )
           OR (al.metadata->'simulation_data'->>'amount') IS NOT NULL
           OR NULLIF(al.metadata->>'fiserv_amount_approved', '') IS NOT NULL
           OR (al.metadata->>'revenue') IS NOT NULL 
           OR (al.metadata->>'faturamento') IS NOT NULL
           OR (al.metadata->>'opt_in')::boolean = true
           OR (al.metadata->>'optin')::boolean = true
           OR (al.metadata->'consent'->>'opt_in')::boolean = true
           OR (al.metadata->>'fiserv_requested_at') IS NOT NULL
           OR (al.metadata->>'loan_request_id') IS NOT NULL
           OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('approved', 'in_quoting', 'comite_approved', 'denied', 'fails_to_process', 'lost', 'cancelled')
           OR lower(COALESCE(al.status, '')) IN ('approved', 'aprovado', 'denied', 'recusado', 'reprovado')
      ) AS m_confirmaram,

      -- 2. Valor Inicial (Etapa 1 da Qualificação): Informou valor desejado plausível (10k a 500k) OU avançou para faturamento / opt-in / crédito
      COUNT(al.id) FILTER (
        WHERE (
          -- Condição A: Informou valor de empréstimo válido (10k a 500k)
          (
            (al.metadata->>'requested_amount') ~ '^[0-9]+(\.[0-9]+)?$' 
            AND length(regexp_replace(al.metadata->>'requested_amount', '\..*$', '')) <= 6
            AND (al.metadata->>'requested_amount')::numeric BETWEEN 10000 AND 500000
          )
          OR (
            (al.metadata->>'valor_inicial') ~ '^[0-9]+(\.[0-9]+)?$' 
            AND length(regexp_replace(al.metadata->>'valor_inicial', '\..*$', '')) <= 6
            AND (al.metadata->>'valor_inicial')::numeric BETWEEN 10000 AND 500000
          )
          OR (al.metadata->'simulation_data'->>'amount') IS NOT NULL
          OR NULLIF(al.metadata->>'fiserv_amount_approved', '') IS NOT NULL
          -- Condição B: Avançou para faturamento (pressupõe que já passou por valor inicial no novo fluxo)
          OR (al.metadata->>'revenue') IS NOT NULL 
          OR (al.metadata->>'faturamento') IS NOT NULL
          -- Condição C: Avançou para opt-in ou análise de crédito
          OR (al.metadata->>'opt_in')::boolean = true
          OR (al.metadata->>'optin')::boolean = true
          OR (al.metadata->'consent'->>'opt_in')::boolean = true
          OR (al.metadata->>'fiserv_requested_at') IS NOT NULL
          OR (al.metadata->>'loan_request_id') IS NOT NULL
          OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('approved', 'in_quoting', 'comite_approved', 'denied', 'fails_to_process', 'lost', 'cancelled')
          OR lower(COALESCE(al.status, '')) IN ('approved', 'aprovado', 'denied', 'recusado', 'reprovado')
        )
      ) AS m_valor_inicial,

      -- 3. Faturamento (Etapa 2 da Qualificação): Informou faturamento OU avançou para opt-in / crédito
      COUNT(al.id) FILTER (
        WHERE (al.metadata->>'revenue') IS NOT NULL 
           OR (al.metadata->>'faturamento') IS NOT NULL
           OR (al.metadata->>'opt_in')::boolean = true
           OR (al.metadata->>'optin')::boolean = true
           OR (al.metadata->'consent'->>'opt_in')::boolean = true
           OR (al.metadata->>'fiserv_requested_at') IS NOT NULL
           OR (al.metadata->>'loan_request_id') IS NOT NULL
           OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('approved', 'in_quoting', 'comite_approved', 'denied', 'fails_to_process', 'lost', 'cancelled')
           OR lower(COALESCE(al.status, '')) IN ('approved', 'aprovado', 'denied', 'recusado', 'reprovado')
      ) AS m_faturamento,

      -- 4. Opt-in
      COUNT(al.id) FILTER (
        WHERE (al.metadata->>'opt_in')::boolean = true
           OR (al.metadata->>'optin')::boolean = true
           OR (al.metadata->'consent'->>'opt_in')::boolean = true
           OR (al.metadata->>'fiserv_requested_at') IS NOT NULL
           OR (al.metadata->>'loan_request_id') IS NOT NULL
           OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('approved', 'in_quoting', 'comite_approved', 'denied', 'fails_to_process', 'lost', 'cancelled')
           OR lower(COALESCE(al.status, '')) IN ('approved', 'aprovado', 'denied', 'recusado', 'reprovado')
      ) AS m_opt_in,

      -- 5. Aprovados (Esteira Fiserv)
      COUNT(al.id) FILTER (
        WHERE NOT (
          (al.metadata->>'lost_reason') IS NOT NULL
          OR lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'recusado', 'desistente')
          OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('denied', 'fails_to_process', 'lost', 'cancelled', 'recusado', 'reprovado', 'declined')
          OR lower(COALESCE(al.status, '')) IN ('denied', 'recusado', 'reprovado')
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%não conseguimos%'
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%nao conseguimos%'
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%reprovad%'
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%recusad%'
        )
        AND (
          lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('approved', 'comite_approved', 'aprovado', 'pre_approved')
          OR lower(COALESCE(al.status, '')) IN ('approved', 'aprovado')
          OR (al.metadata->>'fiserv_is_approved')::boolean = true
          OR (al.metadata->>'fiserv_amount_approved' IS NOT NULL AND al.metadata->>'fiserv_amount_approved' ~ '^[0-9]+(\.[0-9]+)?$' AND (al.metadata->>'fiserv_amount_approved')::numeric > 0)
        )
      ) AS m_aprovados,

      -- 6. Recusados (Esteira Fiserv)
      COUNT(al.id) FILTER (
        WHERE (al.metadata->>'lost_reason') IS NOT NULL
           OR lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'recusado', 'desistente')
           OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('denied', 'fails_to_process', 'lost', 'cancelled', 'recusado', 'reprovado', 'declined')
           OR lower(COALESCE(al.status, '')) IN ('denied', 'recusado', 'reprovado')
           OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%não conseguimos%'
           OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%nao conseguimos%'
           OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%reprovad%'
           OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%recusad%'
      ) AS m_recusados,

      -- 7. Simularam (Exige lead NÃO recusado no crédito E com proposta efetivamente calculada com parcelas/juros)
      COUNT(al.id) FILTER (
        WHERE NOT (
          (al.metadata->>'lost_reason') IS NOT NULL
          OR lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'recusado', 'desistente')
          OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('denied', 'fails_to_process', 'lost', 'cancelled', 'recusado', 'reprovado', 'declined')
          OR lower(COALESCE(al.status, '')) IN ('denied', 'recusado', 'reprovado')
        )
        AND (
          (al.metadata->'simulation_data'->>'installment_value') IS NOT NULL
          OR (al.metadata->'simulation_data'->>'installments') IS NOT NULL
          OR (al.metadata->'simulation_data'->>'monthly_interest') IS NOT NULL
          OR (
            (al.metadata->>'simularam')::boolean = true
            AND lower(COALESCE(al.metadata->>'fiserv_last_status', '')) = 'success'
          )
          OR (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'ok_agente')::boolean = true
          OR (al.metadata->'accepted_proposal') IS NOT NULL
          OR (al.metadata->>'formalized_at') IS NOT NULL
        )
      ) AS m_simularam,

      -- 8. Ok Agente (Aceite de Proposta Simulada)
      COUNT(al.id) FILTER (
        WHERE NOT (
          (al.metadata->>'lost_reason') IS NOT NULL
          OR lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'recusado', 'desistente')
          OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('denied', 'fails_to_process', 'lost', 'cancelled', 'recusado', 'reprovado', 'declined')
          OR lower(COALESCE(al.status, '')) IN ('denied', 'recusado', 'reprovado')
        )
        AND (
          (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'ok_agente')::boolean = true
          OR (al.metadata->'accepted_proposal') IS NOT NULL
          OR (al.metadata->>'formalized_at') IS NOT NULL
        )
      ) AS m_ok_agente,

      -- Bloco 3: Funil de Formalização (Rigorosamente condicionado a ter dado OK na simulação)
      COUNT(al.id) FILTER (
        WHERE (
          (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'ok_agente')::boolean = true
          OR (al.metadata->'accepted_proposal') IS NOT NULL
          OR (al.metadata->>'formalized_at') IS NOT NULL
        )
        AND NOT (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'desistente', 'recusado')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) IN ('declined', 'lost')
          OR lower(COALESCE(al.status, '')) IN ('lost', 'cancelled', 'declined')
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%desistiu%'
          OR (al.metadata->>'decline_at') IS NOT NULL
          OR (al.metadata->>'decline_reason') IS NOT NULL
        )
        AND NOT (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('formalized', 'formalizado', 'won', 'concluido')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) = 'contract_signed'
          OR lower(COALESCE(al.metadata->>'fiserv_status', '')) = 'won'
          OR (al.metadata->>'formalized_at') IS NOT NULL
        )
        AND NOT (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('in_service', 'em_atendimento', 'in_progress', 'formalization')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) IN ('in_contact', 'proposal_sent')
        )
      ) AS m_aguar_contato,
      COUNT(al.id) FILTER (
        WHERE (
          (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'ok_agente')::boolean = true
          OR (al.metadata->'accepted_proposal') IS NOT NULL
          OR (al.metadata->>'formalized_at') IS NOT NULL
        )
        AND NOT (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'desistente', 'recusado')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) IN ('declined', 'lost')
          OR lower(COALESCE(al.status, '')) IN ('lost', 'cancelled', 'declined')
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%desistiu%'
          OR (al.metadata->>'decline_at') IS NOT NULL
          OR (al.metadata->>'decline_reason') IS NOT NULL
        )
        AND NOT (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('formalized', 'formalizado', 'won', 'concluido')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) = 'contract_signed'
          OR lower(COALESCE(al.metadata->>'fiserv_status', '')) = 'won'
          OR (al.metadata->>'formalized_at') IS NOT NULL
        )
        AND (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('in_service', 'em_atendimento', 'in_progress', 'formalization')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) IN ('in_contact', 'proposal_sent')
        )
      ) AS m_em_atendimento,
      COUNT(al.id) FILTER (
        WHERE (
          (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'ok_agente')::boolean = true
          OR (al.metadata->'accepted_proposal') IS NOT NULL
          OR (al.metadata->>'formalized_at') IS NOT NULL
        )
        AND NOT (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'desistente', 'recusado')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) IN ('declined', 'lost')
          OR lower(COALESCE(al.status, '')) IN ('lost', 'cancelled', 'declined')
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%desistiu%'
          OR (al.metadata->>'decline_at') IS NOT NULL
          OR (al.metadata->>'decline_reason') IS NOT NULL
        )
        AND (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('formalized', 'formalizado', 'won', 'concluido')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) = 'contract_signed'
          OR lower(COALESCE(al.metadata->>'fiserv_status', '')) = 'won'
          OR (al.metadata->>'formalized_at') IS NOT NULL
        )
      ) AS m_formalizado,
      COUNT(al.id) FILTER (
        WHERE (
          (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'ok_agente')::boolean = true
          OR (al.metadata->'accepted_proposal') IS NOT NULL
          OR (al.metadata->>'formalized_at') IS NOT NULL
        )
        AND (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'desistente', 'recusado')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) IN ('declined', 'lost')
          OR lower(COALESCE(al.status, '')) IN ('lost', 'cancelled', 'declined')
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%desistiu%'
          OR (al.metadata->>'decline_at') IS NOT NULL
          OR (al.metadata->>'decline_reason') IS NOT NULL
        )
      ) AS m_desistencia
    FROM agent_leads al
    WHERE al.tenant_id = p_tenant_id
      AND al.campaign_id IS NOT NULL
      AND (p_campaign_ids IS NULL OR array_length(p_campaign_ids, 1) IS NULL OR al.campaign_id = ANY(p_campaign_ids))
    GROUP BY al.campaign_id
  )
  SELECT
    oq.cid AS campaign_id,
    oq.cname AS campaign_name,
    oq.cstart_date AS start_date,
    oq.cstatus AS status,
    -- Bloco 1
    COALESCE(oq.m_carregados, 0) AS carregados,
    COALESCE(oq.m_enviados, 0) AS enviados,
    COALESCE(oq.m_entregues, 0) AS entregues,
    COALESCE(oq.m_lidas, 0) AS lidas,
    GREATEST(COALESCE(oq.m_interagiram, 0), COALESCE(lm.m_confirmaram, 0)) AS interagiram,
    -- Bloco 2
    COALESCE(lm.m_confirmaram, 0) AS confirmaram,
    COALESCE(lm.m_faturamento, 0) AS faturamento,
    COALESCE(lm.m_valor_inicial, 0) AS valor_inicial,
    COALESCE(lm.m_opt_in, 0) AS opt_in,
    COALESCE(lm.m_aprovados, 0) AS aprovados,
    COALESCE(lm.m_recusados, 0) AS recusados,
    COALESCE(lm.m_simularam, 0) AS simularam,
    COALESCE(lm.m_ok_agente, 0) AS ok_agente,
    -- Bloco 3
    COALESCE(lm.m_aguar_contato, 0) AS aguar_contato,
    COALESCE(lm.m_em_atendimento, 0) AS em_atendimento,
    COALESCE(lm.m_formalizado, 0) AS formalizado,
    COALESCE(lm.m_desistencia, 0) AS desistencia
  FROM oq_metrics oq
  LEFT JOIN lead_metrics lm ON lm.l_cid = oq.cid
  ORDER BY oq.cstart_date DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_credit_campaign_funnel_stats(UUID, UUID[], TIMESTAMP WITH TIME ZONE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_credit_campaign_funnel_stats(UUID, UUID[], TIMESTAMP WITH TIME ZONE, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_credit_campaign_funnel_stats(UUID, UUID[], TIMESTAMP WITH TIME ZONE, UUID) TO anon;

-- ============================================================
-- 5. Correção Retroativa de Leads Descartados Incorretamente na Fila
-- ============================================================
UPDATE outbound_queue oq
SET response_detected = true,
    metadata = jsonb_set(
        jsonb_set(
            jsonb_set(COALESCE(oq.metadata, '{}'::jsonb), '{is_auto_reply}', 'false'::jsonb),
            '{is_bot}', 'false'::jsonb
        ),
        '{human_interaction}', 'true'::jsonb
    )
FROM agent_leads al
WHERE (
    al.whatsapp = oq.contact_phone
    OR regexp_replace(al.whatsapp, '^55', '') = regexp_replace(oq.contact_phone, '^55', '')
)
AND al.campaign_id = oq.campaign_id
AND (
    (al.metadata->>'identity_confirmed') IN ('true', 't', '1')
    OR (al.metadata->>'cnpj_confirmed') IN ('true', 't', '1')
    OR (al.metadata->>'revenue') IS NOT NULL
    OR (al.metadata->>'faturamento') IS NOT NULL
    OR (al.metadata->>'opt_in')::boolean = true
    OR (al.metadata->>'loan_request_id') IS NOT NULL
)
AND (
    COALESCE((oq.metadata->>'is_auto_reply')::boolean, false) = true
    OR COALESCE((oq.metadata->>'is_bot')::boolean, false) = true
    OR COALESCE(oq.response_detected, false) = false
);
