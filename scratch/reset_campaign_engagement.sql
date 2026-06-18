-- ==============================================================================
-- Reset de Engajamento de Campanha  (v2 — com diagnósticos)
-- Campanha: 990bb04d-fbcd-4805-8ba9-cc2d7cc7de8b
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1a. Confirmar dados da campanha
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    id,
    name,
    status           AS campaign_status,
    total_contacts,
    sent_count,
    failed_count,
    daily_limit,
    start_time,
    end_time,
    reengagement_enabled,
    reengagement_max_attempts,
    success_criteria,
    success_link_filter,
    created_at
FROM public.campaigns
WHERE id = '990bb04d-fbcd-4805-8ba9-cc2d7cc7de8b';


-- ─────────────────────────────────────────────────────────────────────────────
-- 1b. Distribuição de status na fila
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    status,
    COUNT(*)                        AS total,
    MIN(scheduled_at)               AS primeiro_agendado,
    MAX(last_attempt_at)            AS ultima_tentativa,
    MAX(reengagement_attempt_count) AS max_reengajamento
FROM public.outbound_queue
WHERE campaign_id = '990bb04d-fbcd-4805-8ba9-cc2d7cc7de8b'
GROUP BY status
ORDER BY total DESC;


-- ==============================================================================
-- DIAGNÓSTICO A — Convertidos reais (lógica idêntica ao RPC do dashboard)
-- ==============================================================================
-- O dashboard conta como "Links Enviados" (is_converted=TRUE) quem satisfaz
-- UMA das 4 condições abaixo (replicadas do get_campaign_metrics_v2):
--   1. oq.status = 'converted'
--   2. oq.metadata->>'converted' = 'true'
--   3. Mensagem na conversa com tag  '[CONVERSÃO]' (sent APÓS sent_at)
--   4. Campanha tem 'LINK_SENT' em success_criteria + success_link_filter
--      aparece em alguma mensagem do agente (sent APÓS sent_at)
--      (inclui também: has_conversion_tag)
-- ==============================================================================

-- A1. Comparativo de fontes — identifica de onde vêm os 89
SELECT fonte, total FROM (

  SELECT '1. status=converted na fila'         AS fonte,
         COUNT(*)                               AS total
  FROM public.outbound_queue
  WHERE campaign_id = '990bb04d-fbcd-4805-8ba9-cc2d7cc7de8b'
    AND trim(lower(status)) = 'converted'

  UNION ALL

  SELECT '2. metadata.converted=true'          AS fonte,
         COUNT(*)                               AS total
  FROM public.outbound_queue
  WHERE campaign_id = '990bb04d-fbcd-4805-8ba9-cc2d7cc7de8b'
    AND (metadata->>'converted') = 'true'

  UNION ALL

  SELECT '3. tag [CONVERSÃO] na mensagem'      AS fonte,
         COUNT(DISTINCT oq.id)                  AS total
  FROM public.outbound_queue oq
  JOIN public.messages m ON m.conversation_id = oq.conversation_id
  WHERE oq.campaign_id = '990bb04d-fbcd-4805-8ba9-cc2d7cc7de8b'
    AND (m.content ILIKE '%[CONVERSÃO]%' OR m.content ILIKE '%✅ [CONVERSÃO]%')
    AND (oq.sent_at IS NULL OR m.created_at >= oq.sent_at)

  UNION ALL

  SELECT '4. success_link_filter na mensagem'  AS fonte,
         COUNT(DISTINCT oq.id)                  AS total
  FROM public.outbound_queue oq
  JOIN public.campaigns c  ON c.id = oq.campaign_id
  JOIN public.messages m   ON m.conversation_id = oq.conversation_id
  WHERE oq.campaign_id = '990bb04d-fbcd-4805-8ba9-cc2d7cc7de8b'
    AND 'LINK_SENT' = ANY(c.success_criteria)
    AND COALESCE(c.success_link_filter, '') <> ''
    AND m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system')
    AND m.content ILIKE '%' || c.success_link_filter || '%'
    AND (oq.sent_at IS NULL OR m.created_at >= oq.sent_at)

  UNION ALL

  -- Item 5 corrigido: COUNT externo sobre a subquery agrupada
  SELECT '5. TOTAL is_converted=TRUE (qualquer)' AS fonte,
         COUNT(*)                                 AS total
  FROM (
      SELECT oq.id
      FROM public.outbound_queue oq
      JOIN public.campaigns c ON c.id = oq.campaign_id
      LEFT JOIN public.messages m
          ON m.conversation_id = oq.conversation_id
         AND (oq.sent_at IS NULL OR m.created_at >= oq.sent_at)
      WHERE oq.campaign_id = '990bb04d-fbcd-4805-8ba9-cc2d7cc7de8b'
      GROUP BY oq.id, oq.status, oq.metadata, c.success_criteria, c.success_link_filter
      HAVING
          trim(lower(oq.status)) = 'converted'
          OR (oq.metadata->>'converted') = 'true'
          OR bool_or(m.content ILIKE '%[CONVERSÃO]%' OR m.content ILIKE '%✅ [CONVERSÃO]%')
          OR (
              'LINK_SENT' = ANY(c.success_criteria)
              AND COALESCE(c.success_link_filter, '') <> ''
              AND bool_or(
                    m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system')
                    AND m.content ILIKE '%' || c.success_link_filter || '%'
                  )
          )
  ) total_convertidos

) sub
ORDER BY total DESC;

-- ─── Interpretação dos resultados ─────────────────────────────────────────────
-- Critério 1 (status=converted):  leads com status atualizado pelo n8n  → 78
-- Critério 2 (metadata.converted): n8n gravou flag mas não atualizou status → 84
-- Critério 3 (tag na msg):         agente enviou "✅ [CONVERSÃO]" na conversa → 84
-- Critério 4 (link filter):        agente enviou the success_link_filter → 12
-- Critério 5 (TOTAL):              UNION deduplificado de todos — número real
-- O UPDATE do Passo 2 já usa a mesma lógica para proteger esses leads.


-- A2. Lista individual dos convertidos (replicando a lógica do RPC)
--     Use para confirmar quais contatos NÃO devem receber reengajamento
WITH conv_metrics AS (
  SELECT
    oq.id                   AS lead_id,
    oq.contact_phone,
    oq.contact_name,
    oq.status               AS queue_status,
    oq.sent_at,
    oq.reengagement_attempt_count,
    -- Critério 1 e 2
    (trim(lower(oq.status)) = 'converted')            AS c1_status_converted,
    ((oq.metadata->>'converted') = 'true')            AS c2_meta_converted,
    -- Critério 3: tag [CONVERSÃO] em mensagem pós-envio
    bool_or(
      m.content ILIKE '%[CONVERSÃO]%'
      OR m.content ILIKE '%✅ [CONVERSÃO]%'
    )                                                   AS c3_tag_in_msg,
    -- Critério 4: link do success_link_filter enviado pelo agente pós-envio
    bool_or(
      m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system')
      AND COALESCE(c.success_link_filter, '') <> ''
      AND m.content ILIKE '%' || c.success_link_filter || '%'
    )                                                   AS c4_link_sent
  FROM public.outbound_queue oq
  JOIN public.campaigns c ON c.id = oq.campaign_id
  LEFT JOIN public.messages m
    ON m.conversation_id = oq.conversation_id
   AND (oq.sent_at IS NULL OR m.created_at >= oq.sent_at)
  WHERE oq.campaign_id = '990bb04d-fbcd-4805-8ba9-cc2d7cc7de8b'
  GROUP BY oq.id, oq.contact_phone, oq.contact_name, oq.status,
           oq.sent_at, oq.reengagement_attempt_count, oq.metadata,
           c.success_criteria, c.success_link_filter
)
SELECT
  lead_id,
  contact_phone,
  contact_name,
  queue_status,
  reengagement_attempt_count,
  c1_status_converted,
  c2_meta_converted,
  c3_tag_in_msg,
  c4_link_sent,
  -- Flag final: é convertido se qualquer critério for verdadeiro
  (c1_status_converted OR c2_meta_converted OR c3_tag_in_msg OR c4_link_sent) AS is_converted_final
FROM conv_metrics
WHERE (c1_status_converted OR c2_meta_converted OR c3_tag_in_msg OR c4_link_sent)
ORDER BY queue_status, contact_phone;


-- A3. Leads que SERIAM RESETADOS mas são convertidos na lógica real do RPC
--     (status != 'converted' na fila mas is_converted=TRUE pelo critério de mensagem)
--     ESTES devem ser EXCLUÍDOS do reset!
WITH conv_metrics AS (
  SELECT
    oq.id AS lead_id,
    oq.status AS queue_status,
    oq.contact_phone,
    bool_or(
      m.content ILIKE '%[CONVERSÃO]%'
      OR m.content ILIKE '%✅ [CONVERSÃO]%'
    ) AS c3_tag_in_msg,
    bool_or(
      m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system')
      AND COALESCE(c.success_link_filter, '') <> ''
      AND m.content ILIKE '%' || c.success_link_filter || '%'
    ) AS c4_link_sent
  FROM public.outbound_queue oq
  JOIN public.campaigns c ON c.id = oq.campaign_id
  LEFT JOIN public.messages m
    ON m.conversation_id = oq.conversation_id
   AND (oq.sent_at IS NULL OR m.created_at >= oq.sent_at)
  WHERE oq.campaign_id = '990bb04d-fbcd-4805-8ba9-cc2d7cc7de8b'
    AND oq.status != 'converted'              -- apareceriam no reset
    AND (oq.metadata->>'converted') IS DISTINCT FROM 'true'
  GROUP BY oq.id, oq.status, oq.contact_phone, oq.metadata, c.success_criteria, c.success_link_filter
  HAVING
    bool_or(m.content ILIKE '%[CONVERSÃO]%' OR m.content ILIKE '%✅ [CONVERSÃO]%')
    OR bool_or(
         m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system')
         AND COALESCE(c.success_link_filter, '') <> ''
         AND m.content ILIKE '%' || c.success_link_filter || '%'
       )
)
SELECT
  lead_id,
  queue_status,
  contact_phone,
  c3_tag_in_msg,
  c4_link_sent
FROM conv_metrics
ORDER BY queue_status, contact_phone;
-- ↑ Esses leads devem ser ADICIONADOS ao NOT IN do UPDATE abaixo!



-- ==============================================================================
-- DIAGNÓSTICO B — Pending travado
-- Objetivo: entender por que leads com status='pending' nunca foram processados.
-- ==============================================================================

-- B1. Detalhes dos leads travados em pending
SELECT
    oq.id,
    oq.contact_phone,
    oq.contact_name,
    oq.scheduled_at,
    oq.last_attempt_at,
    oq.retry_count,
    oq.reengagement_attempt_count,
    oq.error_message,
    oq.idempotency_key,
    oq.agent_id,
    oq.metadata,
    -- Quanto tempo está parado (em horas)
    ROUND(EXTRACT(EPOCH FROM (NOW() - oq.scheduled_at)) / 3600, 1) AS horas_parado,
    -- Checagem: existe conversa ligada?
    oq.conversation_id,
    -- Checagem: o agente existe e está ativo?
    a.name   AS agent_name,
    a.status AS agent_status
FROM public.outbound_queue oq
LEFT JOIN public.agents a ON a.id = oq.agent_id
WHERE oq.campaign_id = '990bb04d-fbcd-4805-8ba9-cc2d7cc7de8b'
  AND oq.status = 'pending'
ORDER BY oq.scheduled_at ASC;


-- B2. Verificar se o daily_limit já foi atingido
--     (causa comum de pending parado: limite diário da campanha consumido)
WITH sent_today AS (
    SELECT COUNT(*) AS enviados_hoje
    FROM public.outbound_queue
    WHERE campaign_id = '990bb04d-fbcd-4805-8ba9-cc2d7cc7de8b'
      AND status IN ('sent', 'delivered', 'read', 'not_delivered', 'converted')
      AND DATE(last_attempt_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
)
SELECT
    c.name,
    c.daily_limit,
    c.start_time,
    c.end_time,
    st.enviados_hoje,
    c.daily_limit - st.enviados_hoje AS saldo_restante,
    CASE
        WHEN st.enviados_hoje >= c.daily_limit THEN '⛔ LIMITE ATINGIDO'
        WHEN NOW() AT TIME ZONE 'America/Sao_Paulo' < (CURRENT_DATE || ' ' || c.start_time)::TIMESTAMP
        THEN '⏰ FORA DO HORÁRIO (muito cedo)'
        WHEN NOW() AT TIME ZONE 'America/Sao_Paulo' > (CURRENT_DATE || ' ' || c.end_time)::TIMESTAMP
        THEN '⏰ FORA DO HORÁRIO (encerrado)'
        ELSE '✅ Dentro do limite e horário'
    END AS diagnostico
FROM public.campaigns c, sent_today st
WHERE c.id = '990bb04d-fbcd-4805-8ba9-cc2d7cc7de8b';


-- B3. Verificar histórico de processamento do n8n para esses pending
--     (se existir tabela de logs do n8n / execution_logs)
SELECT
    oq.contact_phone,
    oq.scheduled_at,
    oq.idempotency_key,
    -- Procura se houve alguma tentativa registrada em consumption_metrics
    cm.recorded_at  AS ultimo_consumo,
    cm.metric_type,
    cm.metadata->>'campaign_id' AS cm_campaign_id
FROM public.outbound_queue oq
LEFT JOIN public.consumption_metrics cm
    ON cm.metadata->>'contact_phone' = oq.contact_phone
   AND cm.metadata->>'campaign_id'   = oq.campaign_id::text
   AND cm.recorded_at >= oq.scheduled_at - INTERVAL '1 hour'
WHERE oq.campaign_id = '990bb04d-fbcd-4805-8ba9-cc2d7cc7de8b'
  AND oq.status = 'pending'
ORDER BY oq.scheduled_at ASC;


-- ==============================================================================
-- PASSO 2 — RESET DA FILA
-- Execute SOMENTE após validar os diagnósticos acima.
-- ==============================================================================
-- O que faz:
--   • status          → 'pending'
--   • retry_count     → 0
--   • datas           → limpas / scheduled_at = NOW()
--   • reengagement_attempt_count → incrementado (+1)
--   • idempotency_key → nova chave única (evita bloqueio anti-duplicidade)
--
-- Por padrão exclui: 'pending' (já prontos) e 'converted' (preservados).
-- Para incluir converted: remova 'converted' do NOT IN abaixo.
-- ==============================================================================

BEGIN;

-- ⚠️  IMPORTANTE: O UPDATE abaixo EXCLUI do reset todos os convertidos reais,
--     usando a mesma lógica do RPC do dashboard (get_campaign_metrics_v2).
--     Isso protege os 89 leads que clicaram no link / geraram tag [CONVERSÃO],
--     mesmo que o status na fila ainda não seja 'converted'.

WITH
-- Leads que são convertidos via mensagem (tag ou link) — NÃO devem ser resetados
converted_via_message AS (
    SELECT DISTINCT oq.id
    FROM public.outbound_queue oq
    JOIN public.campaigns c ON c.id = oq.campaign_id
    LEFT JOIN public.messages m
        ON m.conversation_id = oq.conversation_id
       AND (oq.sent_at IS NULL OR m.created_at >= oq.sent_at)
    WHERE oq.campaign_id = '990bb04d-fbcd-4805-8ba9-cc2d7cc7de8b'
    GROUP BY oq.id, oq.metadata, c.success_criteria, c.success_link_filter
    HAVING
        -- Critério 3: tag [CONVERSÃO] em mensagem
        bool_or(m.content ILIKE '%[CONVERSÃO]%' OR m.content ILIKE '%✅ [CONVERSÃO]%')
        OR
        -- Critério 4: success_link_filter enviado pelo agente
        (
          'LINK_SENT' = ANY(c.success_criteria)
          AND COALESCE(c.success_link_filter, '') <> ''
          AND bool_or(
                m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system')
                AND m.content ILIKE '%' || c.success_link_filter || '%'
              )
        )
),
target AS (
    SELECT
        oq.id,
        oq.contact_phone,
        COALESCE(oq.reengagement_attempt_count, 0) AS attempt
    FROM public.outbound_queue oq
    WHERE oq.campaign_id = '990bb04d-fbcd-4805-8ba9-cc2d7cc7de8b'
      AND oq.status NOT IN ('pending', 'converted')           -- status já protegidos
      AND (oq.metadata->>'converted') IS DISTINCT FROM 'true' -- metadata.converted=true
      AND oq.id NOT IN (SELECT id FROM converted_via_message)  -- tag/link detectado
)
UPDATE public.outbound_queue oq
SET
    status                     = 'pending',
    retry_count                = 0,
    error_message              = NULL,
    scheduled_at               = NOW(),
    sent_at                    = NULL,
    last_attempt_at            = NULL,
    dedup_at                   = NULL,
    reengagement_attempt_count = t.attempt + 1,
    idempotency_key            = oq.campaign_id
                                 || ':' || oq.contact_phone
                                 || ':re_' || (t.attempt + 1)
                                 || ':' || EXTRACT(EPOCH FROM NOW())::BIGINT
FROM target t
WHERE oq.id = t.id;

-- Confira o nº de linhas afetadas antes de confirmar.
-- COMMIT;   -- ← descomente para confirmar


-- ==============================================================================
-- PASSO 3 — PÓS-VALIDAÇÃO
-- ==============================================================================
SELECT
    status,
    COUNT(*)                        AS total,
    MAX(reengagement_attempt_count) AS max_reengajamento
FROM public.outbound_queue
WHERE campaign_id = '990bb04d-fbcd-4805-8ba9-cc2d7cc7de8b'
GROUP BY status
ORDER BY total DESC;
