-- ============================================================
-- Migration: message_status_truth
-- Description: Implementa o registro de status em tabela separada 
--              e refatora a sincronização de campanhas para usar o histórico.
-- ============================================================

-- [0] Adicionar colunas de métricas se não existirem
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS delivered_count INT DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS read_count INT DEFAULT 0;

-- [1] Garantir tabela de histórico com índices corretos
CREATE TABLE IF NOT EXISTS public.message_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    description TEXT,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msg_status_hist_msg_id ON public.message_status_history(message_id);
CREATE INDEX IF NOT EXISTS idx_msg_status_hist_status ON public.message_status_history(status);

-- [2] Refatorar handle_message_status_update para ser o ponto central de verdade
CREATE OR REPLACE FUNCTION public.handle_message_status_update(
    p_remote_id text,
    p_status_code text,
    p_status_description text,
    p_trace_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_message_id uuid;
    v_campaign_id uuid;
BEGIN
    -- 1. Localizar a mensagem original
    SELECT id, (metadata->>'campaign_id')::uuid INTO v_message_id, v_campaign_id
    FROM public.messages
    WHERE remote_id = p_remote_id OR trace_id = p_trace_id OR trace_id = p_remote_id
    ORDER BY created_at DESC LIMIT 1;

    IF v_message_id IS NOT NULL THEN
        -- 2. Registrar no Histórico (Sempre, sem exceção)
        INSERT INTO public.message_status_history (message_id, status, description, raw_payload)
        VALUES (v_message_id, UPPER(p_status_code), p_status_description, jsonb_build_object('trace_id', p_trace_id, 'remote_id', p_remote_id));

        -- 3. Atualizar status na tabela messages (Cache para consulta rápida)
        UPDATE public.messages
        SET status = UPPER(p_status_code)
        WHERE id = v_message_id;

        -- 4. Atualizar outbound_queue (Cache para o Dashboard Executivo legado)
        UPDATE public.outbound_queue
        SET status = LOWER(p_status_code),
            last_attempt_at = NOW()
        WHERE (metadata->>'message_id')::uuid = v_message_id;

        -- 5. Sincronizar estatísticas da campanha (Se houver uma)
        IF v_campaign_id IS NOT NULL THEN
            PERFORM public.fn_sync_campaign_stats(v_campaign_id);
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'message_id', v_message_id, 'campaign_id', v_campaign_id);
END;
$$;

-- [3] Refatorar fn_sync_campaign_stats para usar o histórico (Fonte da Verdade)
CREATE OR REPLACE FUNCTION public.fn_sync_campaign_stats(p_campaign_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_contacts INT;
    v_sent_count INT;
    v_failed_count INT;
    v_delivered_count INT;
    v_read_count INT;
BEGIN
    -- 1. Contagem Total na Fila
    SELECT COUNT(*) INTO v_total_contacts
    FROM public.outbound_queue
    WHERE campaign_id = p_campaign_id;

    -- 2. Contagem de Mensagens Entregues (Sucesso Logístico)
    -- Baseado em: DELIVERED, READ (se foi lido, obrigatoriamente foi entregue)
    SELECT COUNT(DISTINCT message_id) INTO v_delivered_count
    FROM public.message_status_history
    WHERE status IN ('DELIVERED', 'READ')
      AND message_id IN (
          SELECT id FROM public.messages 
          WHERE (metadata->>'campaign_id')::uuid = p_campaign_id
      );

    -- 3. Contagem de Mensagens Lidas (Sucesso de Engajamento)
    -- Baseado em: READ
    SELECT COUNT(DISTINCT message_id) INTO v_read_count
    FROM public.message_status_history
    WHERE status = 'READ'
      AND message_id IN (
          SELECT id FROM public.messages 
          WHERE (metadata->>'campaign_id')::uuid = p_campaign_id
      );

    -- 4. Contagem de Falhas (Erro)
    -- Baseado em: FAILED, REJECTED
    SELECT COUNT(DISTINCT message_id) INTO v_failed_count
    FROM public.message_status_history
    WHERE status IN ('FAILED', 'REJECTED')
      AND message_id IN (
          SELECT id FROM public.messages 
          WHERE (metadata->>'campaign_id')::uuid = p_campaign_id
      );

    -- 5. Contagem de Enviados (Tentativas de Envio)
    -- Inclui tudo que saiu da fase de "Processando" (SENT, DELIVERED, READ, FAILED, REJECTED)
    SELECT COUNT(DISTINCT message_id) INTO v_sent_count
    FROM public.message_status_history
    WHERE status IN ('SENT', 'DELIVERED', 'READ', 'FAILED', 'REJECTED')
      AND message_id IN (
          SELECT id FROM public.messages 
          WHERE (metadata->>'campaign_id')::uuid = p_campaign_id
      );

    -- 6. Atualizar a tabela de Campanhas
    -- Garante que as colunas novas existam
    BEGIN
        ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS delivered_count INT DEFAULT 0;
        ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS read_count INT DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;

    UPDATE public.campaigns
    SET 
        total_contacts = v_total_contacts,
        sent_count = v_sent_count,
        failed_count = v_failed_count,
        delivered_count = v_delivered_count,
        read_count = v_read_count,
        updated_at = NOW()
    WHERE id = p_campaign_id;

    RETURN jsonb_build_object(
        'success', true,
        'campaign_id', p_campaign_id,
        'delivered_count', v_delivered_count,
        'sent_count', v_sent_count
    );
END;
$$;

-- [4] Refatorar get_campaign_dashboard_stats para usar o histórico (Fonte da Verdade)
CREATE OR REPLACE FUNCTION public.get_campaign_dashboard_stats(
  p_campaign_id UUID DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_total_contacts    BIGINT := 0;
  v_import_errors     BIGINT := 0;
  v_sent_count        BIGINT := 0;
  v_delivered_count   BIGINT := 0;
  v_read_count        BIGINT := 0;
  v_response_count    BIGINT := 0;
  v_conversion_count  BIGINT := 0;
  v_conversion_rate   NUMERIC := 0;
  v_success_criteria  TEXT[];
  v_link_filter       TEXT;
BEGIN
  -- 1. Obter critérios
  IF p_campaign_id IS NOT NULL THEN
    SELECT success_criteria, success_link_filter INTO v_success_criteria, v_link_filter FROM public.campaigns WHERE id = p_campaign_id;
  END IF;

  -- 2. Métricas de Fila
  SELECT COUNT(*) INTO v_total_contacts FROM outbound_queue WHERE (p_campaign_id IS NULL OR campaign_id = p_campaign_id) AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
  SELECT COUNT(*) INTO v_import_errors FROM campaign_import_logs WHERE (p_campaign_id IS NULL OR campaign_id = p_campaign_id) AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

  -- 3. Métricas de Status (Sempre do Histórico)
  SELECT COUNT(DISTINCT message_id) INTO v_sent_count FROM message_status_history WHERE status IN ('SENT', 'DELIVERED', 'READ', 'FAILED', 'REJECTED') AND message_id IN (SELECT id FROM messages WHERE (p_campaign_id IS NULL OR (metadata->>'campaign_id')::uuid = p_campaign_id) AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id));
  SELECT COUNT(DISTINCT message_id) INTO v_delivered_count FROM message_status_history WHERE status IN ('DELIVERED', 'READ') AND message_id IN (SELECT id FROM messages WHERE (p_campaign_id IS NULL OR (metadata->>'campaign_id')::uuid = p_campaign_id) AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id));
  SELECT COUNT(DISTINCT message_id) INTO v_read_count FROM message_status_history WHERE status = 'READ' AND message_id IN (SELECT id FROM messages WHERE (p_campaign_id IS NULL OR (metadata->>'campaign_id')::uuid = p_campaign_id) AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id));

  -- 4. Respostas e Conversão
  SELECT COUNT(*) INTO v_response_count FROM outbound_queue WHERE (p_campaign_id IS NULL OR campaign_id = p_campaign_id) AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id) AND response_detected = true;

  IF p_campaign_id IS NOT NULL AND v_success_criteria IS NOT NULL AND array_length(v_success_criteria, 1) > 0 THEN
      SELECT COUNT(DISTINCT oq.id) INTO v_conversion_count FROM outbound_queue oq WHERE oq.campaign_id = p_campaign_id AND (('CLIENT_RESPONDED' = ANY(v_success_criteria) AND oq.response_detected = true) OR ('LINK_SENT' = ANY(v_success_criteria) AND EXISTS (SELECT 1 FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_identifier = oq.contact_phone AND c.tenant_id = oq.tenant_id AND m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system', 'agent') AND (v_link_filter IS NULL OR v_link_filter = '' OR m.content ILIKE '%' || v_link_filter || '%'))));
  ELSE
      v_conversion_count := v_response_count;
  END IF;

  v_conversion_rate := CASE WHEN v_sent_count = 0 THEN 0 ELSE ROUND((v_conversion_count::NUMERIC / v_sent_count) * 100, 1) END;

  RETURN json_build_object(
    'total_contacts', v_total_contacts,
    'import_errors', v_import_errors,
    'sent_count', v_sent_count,
    'delivered_count', v_delivered_count,
    'read_count', v_read_count,
    'response_count', v_response_count,
    'conversion_count', v_conversion_count,
    'conversion_rate', v_conversion_rate
  );
END;
$$;
