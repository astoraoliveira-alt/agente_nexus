-- =========================================================================
-- REPLY GAP TRACKER — v1.0
-- Objetivo: Detectar e registrar casos onde o agente recebeu uma mensagem
-- inbound mas falhou silenciosamente em enviar a resposta ao cliente.
--
-- Contexto: O status 'done' na inbound_queue NÃO garante que uma resposta
-- foi enviada — apenas que o N8N finalizou o processamento. Esta migration
-- adiciona a camada de observabilidade que faltava.
-- =========================================================================


-- =========================================================================
-- PARTE 1: Coluna `reply_sent` na inbound_queue
-- Flag explícita: TRUE = resposta foi confirmada como enviada ao cliente
-- =========================================================================
ALTER TABLE public.inbound_queue
  ADD COLUMN IF NOT EXISTS reply_sent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reply_sent_at TIMESTAMPTZ DEFAULT NULL;

-- Índice para acelerar a varredura do job reativo
CREATE INDEX IF NOT EXISTS idx_inbound_queue_reply_gap
  ON public.inbound_queue(status, reply_sent, processed_at)
  WHERE status = 'done' AND reply_sent = FALSE;

COMMENT ON COLUMN public.inbound_queue.reply_sent IS
  'TRUE quando uma resposta outbound foi confirmada como enviada ao cliente. FALSE = possível gap de resposta.';

COMMENT ON COLUMN public.inbound_queue.reply_sent_at IS
  'Timestamp do momento em que a resposta foi confirmada como enviada.';


-- =========================================================================
-- PARTE 2: Índice de suporte para queries de reply_gap em inbound_queue_errors
-- (O campo status já é TEXT — suporta qualquer valor sem alteração de tipo)
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_inb_queue_err_reply_gap
  ON public.inbound_queue_errors(status, queue_id)
  WHERE status = 'reply_gap';

-- Garantir que n8n_execution_id existe (adicionado em versões mais recentes)
ALTER TABLE public.inbound_queue_errors
  ADD COLUMN IF NOT EXISTS n8n_execution_id TEXT DEFAULT NULL;


-- =========================================================================
-- PARTE 3: fn_mark_reply_sent — Chamada pelo N8N após envio bem-sucedido
-- =========================================================================
CREATE OR REPLACE FUNCTION public.fn_mark_reply_sent(
  p_trace_id TEXT,
  p_queue_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows_updated INT;
BEGIN
  -- Atualiza pela trace_id (padrão) ou pelo queue_id (fallback)
  UPDATE public.inbound_queue
  SET
    reply_sent     = TRUE,
    reply_sent_at  = NOW()
  WHERE
    (
      (p_trace_id IS NOT NULL AND (trace_id = p_trace_id OR external_id = p_trace_id))
      OR
      (p_queue_id IS NOT NULL AND id = p_queue_id)
    )
    AND reply_sent = FALSE; -- Idempotente: não atualiza se já marcado

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success',       TRUE,
    'rows_updated',  v_rows_updated,
    'trace_id',      p_trace_id,
    'queue_id',      p_queue_id,
    'marked_at',     NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_mark_reply_sent(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mark_reply_sent(TEXT, UUID) TO service_role;

COMMENT ON FUNCTION public.fn_mark_reply_sent IS
  'Marca uma entrada da inbound_queue como "resposta enviada". Chamada pelo N8N após confirmação de envio bem-sucedido pela Zenvia/Evolution.';


-- =========================================================================
-- PARTE 4: fn_log_reply_gap — Registra um gap detectado pelo N8N (proativo)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.fn_log_reply_gap(
  p_queue_id      UUID,
  p_context       JSONB DEFAULT '{}'::JSONB,
  p_error_message TEXT DEFAULT 'Reply not sent: delivery failure detected'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n8n_execution_id TEXT;
BEGIN
  v_n8n_execution_id := p_context->>'n8n_execution_id';

  -- Marca a fila como tendo gerado um gap (mas não marca como 'failed'
  -- para não bloquear a fila — a mensagem foi processada, só não entregue)
  UPDATE public.inbound_queue
  SET
    reply_sent    = FALSE,  -- Explicitamente confirma que não foi enviada
    error_message = COALESCE(error_message, '') || ' [Reply Gap: ' || p_error_message || ']'
  WHERE id = p_queue_id
    AND reply_sent = FALSE;

  -- Registra na tabela de erros para visibilidade (somente se ainda não logado)
  INSERT INTO public.inbound_queue_errors (
    n8n_execution_id,
    queue_id,
    error_message,
    payload,
    status
  )
  SELECT
    COALESCE(v_n8n_execution_id, 'unknown'),
    p_queue_id,
    p_error_message,
    p_context,
    'reply_gap'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.inbound_queue_errors
    WHERE queue_id = p_queue_id
      AND status   = 'reply_gap'
  );

  RETURN jsonb_build_object(
    'success',    TRUE,
    'queue_id',   p_queue_id,
    'gap_logged', TRUE,
    'logged_at',  NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_log_reply_gap(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_log_reply_gap(UUID, JSONB, TEXT) TO service_role;

COMMENT ON FUNCTION public.fn_log_reply_gap IS
  'Registra um gap de resposta detectado pelo N8N em tempo real. Chamada no branch de erro dos nós de envio (Zenvia/Evolution).';


-- =========================================================================
-- PARTE 5: fn_check_reply_gap — Job reativo (varredura periódica)
-- Detecta gaps históricos que o N8N não conseguiu capturar
-- =========================================================================
CREATE OR REPLACE FUNCTION public.fn_check_reply_gap(
  p_lookback_minutes INT DEFAULT 60,   -- Janela de busca retroativa
  p_grace_minutes    INT DEFAULT 5     -- Tempo mínimo desde processed_at para considerar gap
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gap             RECORD;
  v_gaps_found      INT := 0;
  v_gaps_logged     INT := 0;
  v_already_logged  INT := 0;
  v_cutoff_time     TIMESTAMPTZ;
  v_grace_time      TIMESTAMPTZ;
BEGIN
  v_cutoff_time := NOW() - (p_lookback_minutes || ' minutes')::INTERVAL;
  v_grace_time  := NOW() - (p_grace_minutes    || ' minutes')::INTERVAL;

  -- Varre inbound_queue: done + sem reply_sent + além do período de graça
  FOR v_gap IN
    SELECT
      iq.id,
      iq.trace_id,
      iq.external_id,
      iq.agent_id,
      iq.tenant_id,
      iq.payload,
      iq.n8n_execution_id,
      iq.processed_at,
      iq.error_message
    FROM public.inbound_queue iq
    WHERE
      iq.status        = 'done'
      AND iq.reply_sent = FALSE
      AND iq.processed_at BETWEEN v_cutoff_time AND v_grace_time
      -- Evita re-registrar gaps já logados
      AND NOT EXISTS (
        SELECT 1 FROM public.inbound_queue_errors iqe
        WHERE iqe.queue_id = iq.id
          AND iqe.status   = 'reply_gap'
      )
  LOOP
    v_gaps_found := v_gaps_found + 1;

    -- Registra o gap
    PERFORM public.fn_log_reply_gap(
      p_queue_id      := v_gap.id,
      p_context       := jsonb_build_object(
        'tenant_id',          v_gap.tenant_id,
        'agent_id',           v_gap.agent_id,
        'trace_id',           v_gap.trace_id,
        'n8n_execution_id',   v_gap.n8n_execution_id,
        'payload',            v_gap.payload,
        'processed_at',       v_gap.processed_at,
        'detected_by',        'fn_check_reply_gap',
        'detection_method',   'periodic_scan'
      ),
      p_error_message := 'Periodic scan: done without reply_sent after ' || p_grace_minutes || ' minutes'
    );

    v_gaps_logged := v_gaps_logged + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success',           TRUE,
    'gaps_found',        v_gaps_found,
    'gaps_logged',       v_gaps_logged,
    'lookback_minutes',  p_lookback_minutes,
    'grace_minutes',     p_grace_minutes,
    'scanned_at',        NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_check_reply_gap(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_reply_gap(INT, INT) TO service_role;

COMMENT ON FUNCTION public.fn_check_reply_gap IS
  'Job reativo de detecção de gaps de resposta. Varre a inbound_queue por entradas done+reply_sent=false após período de graça. Deve ser agendado via pg_cron ou chamado pelo N8N agendado.';


-- =========================================================================
-- PARTE 6: RPC de leitura para o frontend — fn_get_reply_gaps
-- =========================================================================
CREATE OR REPLACE FUNCTION public.fn_get_reply_gaps(
  p_tenant_id UUID,
  p_limit     INT  DEFAULT 50,
  p_since     TIMESTAMPTZ DEFAULT NOW() - INTERVAL '24 hours'
)
RETURNS TABLE (
  queue_id          UUID,
  trace_id          TEXT,
  agent_id          UUID,
  tenant_id         UUID,
  phone             TEXT,
  client_message    TEXT,
  gap_detected_at   TIMESTAMPTZ,
  processed_at      TIMESTAMPTZ,
  n8n_execution_id  TEXT,
  error_detail      TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    iq.id                                           AS queue_id,
    iq.trace_id,
    iq.agent_id,
    iq.tenant_id,
    iq.payload->>'phone'                            AS phone,
    iq.payload->>'content'                          AS client_message,
    iqe.created_at                                  AS gap_detected_at,
    iq.processed_at,
    iq.n8n_execution_id,
    iqe.error_message                               AS error_detail
  FROM public.inbound_queue_errors iqe
  JOIN public.inbound_queue iq ON iq.id = iqe.queue_id
  WHERE
    iq.tenant_id = p_tenant_id
    AND iqe.status   = 'reply_gap'
    AND iqe.created_at >= p_since
  ORDER BY iqe.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_reply_gaps(UUID, INT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_reply_gaps(UUID, INT, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION public.fn_get_reply_gaps IS
  'Retorna os gaps de resposta detectados para um tenant. Usada pelo dashboard de saúde do sistema.';


-- =========================================================================
-- VERIFICAÇÃO FINAL
-- =========================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Reply Gap Tracker instalado com sucesso!';
  RAISE NOTICE '   - Coluna reply_sent adicionada à inbound_queue';
  RAISE NOTICE '   - fn_mark_reply_sent: marcar resposta enviada';
  RAISE NOTICE '   - fn_log_reply_gap: registrar gap proativamente (N8N)';
  RAISE NOTICE '   - fn_check_reply_gap: varredura reativa periódica';
  RAISE NOTICE '   - fn_get_reply_gaps: leitura para frontend';
  RAISE NOTICE '';
  RAISE NOTICE '📌 Próximos passos:';
  RAISE NOTICE '   1. Atualizar record_message para chamar fn_mark_reply_sent';
  RAISE NOTICE '   2. Adicionar nó Reply Guard no N8N (documentação gerada)';
  RAISE NOTICE '   3. Agendar fn_check_reply_gap via pg_cron ou N8N agendado';
END $$;
