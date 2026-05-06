-- ============================================================
-- RPC: get_campaign_dashboard_stats (v9 - Recovery & Isolation)
-- Descrição: Restaura contadores básicos e mantém isolamento de link.
-- ============================================================

CREATE OR REPLACE FUNCTION get_campaign_dashboard_stats(
  p_campaign_id UUID DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
  -- 1. Critérios da Campanha
  IF p_campaign_id IS NOT NULL THEN
    SELECT success_criteria, success_link_filter 
    INTO v_success_criteria, v_link_filter
    FROM campaigns 
    WHERE id = p_campaign_id;
  END IF;

  -- 2. Erros de Importação
  SELECT COUNT(*) INTO v_import_errors
  FROM campaign_import_logs
  WHERE (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

  -- 3. Métricas de Leads (Lógica Simplificada e Segura)
  WITH RawMetrics AS (
    SELECT 
      oq.id,
      oq.contact_phone,
      oq.tenant_id,
      oq.campaign_id,
      COALESCE(oq.response_detected, false) as has_interacted,
      COALESCE(
        (
          SELECT lower(status)
          FROM public.message_status_history msh
          WHERE msh.message_id = (oq.metadata->>'message_id')::uuid
          ORDER BY created_at DESC
          LIMIT 1
        ),
        lower(oq.status::text)
      ) as current_status
    FROM outbound_queue oq
    WHERE (p_campaign_id IS NULL OR oq.campaign_id = p_campaign_id)
      AND (p_tenant_id IS NULL OR oq.tenant_id = p_tenant_id)
  )
  SELECT 
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE current_status IN ('sent', 'enviada', 'delivered', 'entregue', 'read', 'lida', 'converted', 'convertida') OR has_interacted = true) AS sent,
    COUNT(*) FILTER (WHERE current_status IN ('sent', 'enviada', 'delivered', 'entregue', 'read', 'lida', 'converted', 'convertida') OR has_interacted = true) AS delivered,
    COUNT(*) FILTER (WHERE current_status IN ('read', 'lida', 'converted', 'convertida') OR has_interacted = true) AS read_count,
    COUNT(*) FILTER (WHERE has_interacted = true) AS response_count
  INTO 
    v_total_contacts, v_sent_count, v_delivered_count, v_read_count, v_response_count
  FROM RawMetrics;

  -- 4. Conversão (Isolamento de Campanha garantido)
  IF p_campaign_id IS NOT NULL AND v_success_criteria IS NOT NULL AND array_length(v_success_criteria, 1) > 0 THEN
      SELECT COUNT(DISTINCT oq.id) INTO v_conversion_count
      FROM RawMetrics oq
      WHERE (
          ('CLIENT_RESPONDED' = ANY(v_success_criteria) AND oq.has_interacted = true)
          OR
          ('LINK_SENT' = ANY(v_success_criteria) AND EXISTS (
             SELECT 1 FROM messages m 
             JOIN conversations c ON c.id = m.conversation_id
             WHERE c.user_identifier = oq.contact_phone
               AND c.tenant_id = oq.tenant_id
               AND c.campaign_id = oq.campaign_id -- Trava de Campanha
               AND m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system', 'agent')
               AND (v_link_filter IS NULL OR v_link_filter = '' OR m.content ILIKE '%' || v_link_filter || '%')
          ))
        );
  ELSE
      v_conversion_count := v_response_count;
  END IF;

  -- 5. Taxa de Conversão
  v_conversion_rate := CASE WHEN v_sent_count = 0 THEN 0 ELSE ROUND((v_conversion_count::NUMERIC / v_sent_count) * 100, 1) END;

  RETURN json_build_object(
    'total_contacts',    COALESCE(v_total_contacts, 0),
    'import_errors',     COALESCE(v_import_errors, 0),
    'sent_count',        COALESCE(v_sent_count, 0),
    'delivered_count',   COALESCE(v_delivered_count, 0),
    'read_count',        COALESCE(v_read_count, 0),
    'response_count',    COALESCE(v_response_count, 0),
    'conversion_count',  COALESCE(v_conversion_count, 0),
    'conversion_rate',   COALESCE(v_conversion_rate, 0)
  );
END;
$$;
