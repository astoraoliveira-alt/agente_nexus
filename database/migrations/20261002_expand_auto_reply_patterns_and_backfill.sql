-- ============================================================
-- Migration: 20261002_expand_auto_reply_patterns_and_backfill.sql
-- Descrição:
-- 1. Expande o reconhecimento de respostas automáticas de robôs/secretárias eletrônicas
--    (WhatsApp Business, AutoResponder, URA, cardápios, horário comercial, regras de atendimento).
-- 2. Atualiza a função track_campaign_response() e seu trigger em messages.
-- 3. Executa BACKFILL RETROATIVO na outbound_queue para expurgar imediatamente do funil
--    as conversas respondidas por robôs já capturadas nas campanhas de hoje e anteriores.
-- 4. Preserva a GARANTIA ABSOLUTA: cliques de botão ('quero simular!', etc.) e leads que
--    avançaram para confirmação, faturamento ou opt-in NUNCA são classificados como robô.
-- ============================================================

-- 1. Atualiza a função do Trigger com Regex Completo e Expandido
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
            -- Recupera o identificador do contato a partir da conversa
            SELECT user_identifier INTO v_user_phone
            FROM conversations
            WHERE id = NEW.conversation_id;

            -- Localiza o item correspondente na outbound_queue
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
                -- Detecção Robusta e Abrangente de Auto-Resposta / Robôs de WhatsApp Business
                ELSIF v_text ~* '(agradece seu contato|como podemos ajudar|como posso te ajudar|não est(ou|amos) dispon[ií]ve|não estamos funcionando|não está funcionando|funcionamos de .* [aà]s?|fora de hor[aá]rio|hor[aá]rio de atendimento|horário de funcionamento|hor[aá]rio comercial|estamos fechados|faça seu pedido|nosso card[aá]pio|acesse nosso cat[aá]logo|atendente foi solicitado|atendimento feito por pessoas|responderemos assim que poss[ií]vel|em breve retornaremos|retornaremos em breve|retornaremos assim que|retornaremos o contato|expediente foi encerrado|hora marcada|pedidos pelo whatsapp|para realizar seu pedido|para agilizar (o|seu) atendimento|agilizar o seu atendimento|endere[cç]o de entrega|AutoResponder|prezado(a)? cliente|voc[eê] est[aá] n[ao]|voc[eê] talvez busque|ordem de chegada|cobramos taxa|seja bem-vindo|bem-vindo(a)? [aà]|obrigad[ao] pelo contato|obrigad[ao] pela compreens[aã]o|conheça nossas m[ií]dias|mensagem autom[aá]tica|resposta autom[aá]tica|atendimento autom[aá]tico|este canal [eé] exclusivo|este n[uú]mero (não recebe|não aceita) ligaç)' THEN
                    v_is_auto_reply := TRUE;
                ELSE
                    -- Em dúvida: registra como humano
                    v_is_auto_reply := FALSE;
                END IF;

                -- Atualiza a fila com a flag auditável
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

                -- Incrementa o contador de respostas da campanha
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

-- Garante que o trigger está ativo
DROP TRIGGER IF EXISTS trg_track_campaign_response ON messages;
CREATE TRIGGER trg_track_campaign_response
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION track_campaign_response();

-- ============================================================
-- 2. BACKFILL RETROATIVO: Identifica e expurga robôs já recebidos
-- ============================================================
WITH bot_messages AS (
    SELECT DISTINCT ON (c.user_identifier)
        c.user_identifier AS phone,
        m.content AS initial_text
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.sender_type = 'user'
      AND m.content ~* '(agradece seu contato|como podemos ajudar|como posso te ajudar|não est(ou|amos) dispon[ií]ve|não estamos funcionando|não está funcionando|funcionamos de .* [aà]s?|fora de hor[aá]rio|hor[aá]rio de atendimento|horário de funcionamento|hor[aá]rio comercial|estamos fechados|faça seu pedido|nosso card[aá]pio|acesse nosso cat[aá]logo|atendente foi solicitado|atendimento feito por pessoas|responderemos assim que poss[ií]vel|em breve retornaremos|retornaremos em breve|retornaremos assim que|retornaremos o contato|expediente foi encerrado|hora marcada|pedidos pelo whatsapp|para realizar seu pedido|para agilizar (o|seu) atendimento|agilizar o seu atendimento|endere[cç]o de entrega|AutoResponder|prezado(a)? cliente|voc[eê] est[aá] n[ao]|voc[eê] talvez busque|ordem de chegada|cobramos taxa|seja bem-vindo|bem-vindo(a)? [aà]|obrigad[ao] pelo contato|obrigad[ao] pela compreens[aã]o|conheça nossas m[ií]dias|mensagem autom[aá]tica|resposta autom[aá]tica|atendimento autom[aá]tico|este canal [eé] exclusivo|este n[uú]mero (não recebe|não aceita) ligaç)'
      AND lower(trim(m.content)) NOT IN ('quero simular!', 'quero simular', 'falar com um agente!', 'falar com um agente', 'simular')
    ORDER BY c.user_identifier, m.created_at ASC
)
UPDATE outbound_queue oq
SET metadata = jsonb_set(
    jsonb_set(
        COALESCE(oq.metadata, '{}'::jsonb),
        '{is_auto_reply}',
        'true'::jsonb
    ),
    '{human_interaction}',
    'false'::jsonb
)
FROM bot_messages bm
WHERE oq.contact_phone = bm.phone
  AND COALESCE(oq.response_detected, false) = true
  AND NOT EXISTS (
    -- Salvaguarda de Auditoria: NUNCA desmarca como humano se o lead avançou em qualquer etapa
    SELECT 1 
    FROM agent_leads al
    WHERE al.campaign_id = oq.campaign_id
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
-- 3. RPC Oficial get_credit_campaign_funnel_stats Reforçada
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
  carregados BIGINT,
  enviados BIGINT,
  entregues BIGINT,
  lidas BIGINT,
  interagiram BIGINT,
  confirmaram BIGINT,
  faturamento BIGINT,
  valor_inicial BIGINT,
  opt_in BIGINT,
  aprovados BIGINT,
  recusados BIGINT,
  simularam BIGINT,
  ok_agente BIGINT,
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
      
      -- INTERAGIRAM COM EXPURGO DE AUTO-RESPOSTAS DE ROBÔS
      COUNT(oq.id) FILTER (
        WHERE (
          COALESCE(oq.response_detected, false) = true
          OR (oq.metadata->>'responded') = 'true'
          OR trim(lower(oq.status)) IN ('respondida', 'interagiu')
        )
        -- Descarta se explicitamente identificado como robô/auto-resposta
        AND NOT (
          COALESCE((oq.metadata->>'is_auto_reply')::boolean, false) = true
          OR COALESCE((oq.metadata->>'is_bot')::boolean, false) = true
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
      
      -- 1. Confirmaram
      COUNT(al.id) FILTER (
        WHERE (al.metadata->>'identity_confirmed') IN ('true', 't', '1')
           OR (al.metadata->>'cnpj_confirmed') IN ('true', 't', '1')
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

      -- 2. Faturamento
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

      -- 3. Valor Inicial
      COUNT(al.id) FILTER (
        WHERE (
          ((al.metadata->>'revenue') IS NOT NULL OR (al.metadata->>'faturamento') IS NOT NULL)
          AND (
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
            OR (
              (al.metadata->'simulation_data'->>'amount') ~ '^[0-9]+(\.[0-9]+)?$'
              AND length(regexp_replace(al.metadata->'simulation_data'->>'amount', '\..*$', '')) <= 6
              AND (al.metadata->'simulation_data'->>'amount')::numeric BETWEEN 10000 AND 500000
            )
            OR (
              (al.metadata->>'fiserv_amount_approved') ~ '^[0-9]+(\.[0-9]+)?$'
              AND length(regexp_replace(al.metadata->>'fiserv_amount_approved', '\..*$', '')) <= 6
              AND (al.metadata->>'fiserv_amount_approved')::numeric BETWEEN 10000 AND 500000
            )
          )
        )
        OR (al.metadata->>'opt_in')::boolean = true
        OR (al.metadata->>'optin')::boolean = true
        OR (al.metadata->'consent'->>'opt_in')::boolean = true
        OR (al.metadata->>'fiserv_requested_at') IS NOT NULL
        OR (al.metadata->>'loan_request_id') IS NOT NULL
        OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('approved', 'in_quoting', 'comite_approved', 'denied', 'fails_to_process', 'lost', 'cancelled')
        OR lower(COALESCE(al.status, '')) IN ('approved', 'aprovado', 'denied', 'recusado', 'reprovado')
      ) AS m_valor_inicial,

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

      -- 5. Aprovados
      COUNT(al.id) FILTER (
        WHERE lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('approved', 'in_quoting', 'comite_approved')
           OR lower(COALESCE(al.status, '')) = 'approved'
           OR lower(COALESCE(al.metadata->>'status', '')) = 'approved'
           OR (al.metadata->>'fiserv_is_approved')::boolean = true
           OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) IN ('pré-aprovado', 'pre-aprovado', 'aprovado')
      ) AS m_aprovados,

      -- 6. Recusados
      COUNT(al.id) FILTER (
        WHERE (
          (al.metadata->>'opt_in')::boolean = true
          OR (al.metadata->>'optin')::boolean = true
          OR (al.metadata->'consent'->>'opt_in')::boolean = true
          OR (al.metadata->>'fiserv_requested_at') IS NOT NULL
          OR (al.metadata->>'loan_request_id') IS NOT NULL
          OR lower(COALESCE(al.status, '')) IN ('denied', 'recusado', 'reprovado')
        )
        AND (
          lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('denied', 'fails_to_process', 'lost', 'cancelled')
          OR lower(COALESCE(al.status, '')) IN ('denied', 'recusado', 'reprovado')
          OR lower(COALESCE(al.metadata->>'status', '')) IN ('denied', 'recusado', 'reprovado')
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) LIKE '%não conseguimos%'
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) LIKE '%reprovado%'
        )
      ) AS m_recusados,

      -- 7. Simularam
      COUNT(al.id) FILTER (
        WHERE (
          (al.metadata->>'opt_in')::boolean = true
          OR (al.metadata->>'optin')::boolean = true
          OR (al.metadata->'consent'->>'opt_in')::boolean = true
          OR (al.metadata->>'fiserv_requested_at') IS NOT NULL
          OR (al.metadata->>'loan_request_id') IS NOT NULL
        )
        AND NOT (
          lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('denied', 'fails_to_process', 'lost', 'cancelled')
          OR lower(COALESCE(al.status, '')) IN ('denied', 'recusado', 'reprovado')
          OR lower(COALESCE(al.metadata->>'status', '')) IN ('denied', 'recusado', 'reprovado')
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) LIKE '%não conseguimos%'
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) LIKE '%reprovado%'
        )
        AND (
          (al.metadata->>'simularam')::boolean = true
          OR (al.metadata->>'simulation_requested')::boolean = true
          OR (al.metadata->'simulation_data'->>'installment_value') IS NOT NULL
          OR (al.metadata->'simulation_data'->>'installments') IS NOT NULL
          OR (al.metadata->'simulation_data'->>'installments_count') IS NOT NULL
          OR (al.metadata->>'ok_agente')::boolean = true
          OR (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'formalized_at') IS NOT NULL
          OR lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('formalized', 'formalizado', 'won', 'concluido')
        )
      ) AS m_simularam,

      -- 8. Ok Agente
      COUNT(al.id) FILTER (
        WHERE (
          (al.metadata->>'opt_in')::boolean = true
          OR (al.metadata->>'optin')::boolean = true
          OR (al.metadata->'consent'->>'opt_in')::boolean = true
          OR (al.metadata->>'fiserv_requested_at') IS NOT NULL
          OR (al.metadata->>'loan_request_id') IS NOT NULL
        )
        AND NOT (
          lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('denied', 'fails_to_process', 'lost', 'cancelled')
          OR lower(COALESCE(al.status, '')) IN ('denied', 'recusado', 'reprovado')
          OR lower(COALESCE(al.metadata->>'status', '')) IN ('denied', 'recusado', 'reprovado')
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) LIKE '%não conseguimos%'
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) LIKE '%reprovado%'
        )
        AND (
          (al.metadata->>'ok_agente')::boolean = true
          OR (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'accepted_proposal') IS NOT NULL
          OR (al.metadata->>'formalized_at') IS NOT NULL
          OR lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('formalized', 'formalizado', 'won', 'concluido')
        )
      ) AS m_ok_agente,

      -- 9. Aguardando Contato
      COUNT(al.id) FILTER (
        WHERE (
          (al.metadata->>'ok_agente')::boolean = true
          OR (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'accepted_proposal') IS NOT NULL
        )
        AND NOT (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'desistente', 'recusado')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) IN ('declined', 'lost')
          OR lower(COALESCE(al.status, '')) IN ('lost', 'cancelled', 'declined')
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) LIKE '%desistiu%'
          OR (al.metadata->>'decline_at') IS NOT NULL
          OR (al.metadata->>'decline_reason') IS NOT NULL
          OR lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('formalized', 'formalizado', 'won', 'concluido')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) = 'contract_signed'
          OR lower(COALESCE(al.metadata->>'fiserv_status', '')) = 'won'
          OR (al.metadata->>'formalized_at') IS NOT NULL
          OR lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('in_service', 'em_atendimento', 'in_progress', 'formalization')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) IN ('in_contact', 'proposal_sent')
        )
      ) AS m_aguar_contato,

      -- 10. Em Atendimento
      COUNT(al.id) FILTER (
        WHERE (
          (al.metadata->>'ok_agente')::boolean = true
          OR (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'accepted_proposal') IS NOT NULL
        )
        AND NOT (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'desistente', 'recusado')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) IN ('declined', 'lost')
          OR lower(COALESCE(al.status, '')) IN ('lost', 'cancelled', 'declined')
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) LIKE '%desistiu%'
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

      -- 11. Formalizado
      COUNT(al.id) FILTER (
        WHERE (
          (al.metadata->>'ok_agente')::boolean = true
          OR (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'accepted_proposal') IS NOT NULL
          OR (al.metadata->>'formalized_at') IS NOT NULL
        )
        AND NOT (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'desistente', 'recusado')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) IN ('declined', 'lost')
          OR lower(COALESCE(al.status, '')) IN ('lost', 'cancelled', 'declined')
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) LIKE '%desistiu%'
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

      -- 12. Desistência
      COUNT(al.id) FILTER (
        WHERE (
          (al.metadata->>'ok_agente')::boolean = true
          OR (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'accepted_proposal') IS NOT NULL
        )
        AND (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'desistente', 'recusado')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) IN ('declined', 'lost')
          OR lower(COALESCE(al.status, '')) IN ('lost', 'cancelled', 'declined')
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) LIKE '%desistiu%'
          OR (al.metadata->>'decline_at') IS NOT NULL
          OR (al.metadata->>'decline_reason') IS NOT NULL
        )
      ) AS m_desistencia

    FROM agent_leads al
    WHERE al.tenant_id = p_tenant_id
      AND (p_campaign_ids IS NULL OR array_length(p_campaign_ids, 1) IS NULL OR al.campaign_id = ANY(p_campaign_ids))
      AND (p_start_date IS NULL OR al.created_at >= p_start_date)
    GROUP BY al.campaign_id
  )
  SELECT
    om.cid AS campaign_id,
    om.cname AS campaign_name,
    om.cstart_date AS start_date,
    om.cstatus AS status,
    -- Bloco 1: Envio da Campanha
    om.m_carregados AS carregados,
    om.m_enviados AS enviados,
    om.m_entregues AS entregues,
    om.m_lidas AS lidas,
    om.m_interagiram AS interagiram,
    -- Bloco 2: Funil de Venda
    COALESCE(lm.m_confirmaram, 0) AS confirmaram,
    COALESCE(lm.m_faturamento, 0) AS faturamento,
    COALESCE(lm.m_valor_inicial, 0) AS valor_inicial,
    COALESCE(lm.m_opt_in, 0) AS opt_in,
    COALESCE(lm.m_aprovados, 0) AS aprovados,
    COALESCE(lm.m_recusados, 0) AS recusados,
    COALESCE(lm.m_simularam, 0) AS simularam,
    COALESCE(lm.m_ok_agente, 0) AS ok_agente,
    -- Bloco 3: Funil de Formalização
    COALESCE(lm.m_aguar_contato, 0) AS aguar_contato,
    COALESCE(lm.m_em_atendimento, 0) AS em_atendimento,
    COALESCE(lm.m_formalizado, 0) AS formalizado,
    COALESCE(lm.m_desistencia, 0) AS desistencia
  FROM oq_metrics om
  LEFT JOIN lead_metrics lm ON lm.l_cid = om.cid
  ORDER BY om.cstart_date DESC;
END;
$$;
