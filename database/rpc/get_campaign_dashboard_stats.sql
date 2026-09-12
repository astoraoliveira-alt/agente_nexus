-- ============================================================
-- RPC: get_campaign_dashboard_stats
-- Descrição: Agrega métricas de performance de campanhas outbound usando o histórico de status
-- ============================================================

CREATE OR REPLACE FUNCTION get_campaign_dashboard_stats(
  p_campaign_id UUID DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL,
  p_agent_id UUID DEFAULT NULL
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
  
  -- Filtros de Campanha
  v_success_criteria  TEXT[];
  v_link_filter       TEXT;
BEGIN
  -- 1. Obter critérios se for uma campanha específica
  IF p_campaign_id IS NOT NULL THEN
    SELECT success_criteria, success_link_filter 
    INTO v_success_criteria, v_link_filter
    FROM campaigns 
    WHERE id = p_campaign_id;
  END IF;

  -- 2. Carregar Métricas Base (Contatos e Erros)
  -- Total na fila (carregados)
  SELECT COUNT(oq.id) INTO v_total_contacts
  FROM outbound_queue oq
  JOIN campaigns c ON oq.campaign_id = c.id
  WHERE (p_campaign_id IS NULL OR oq.campaign_id = p_campaign_id)
    AND (p_tenant_id IS NULL OR oq.tenant_id = p_tenant_id)
    AND (p_agent_id IS NULL OR c.agent_id = p_agent_id);

  -- Erros de importação
  SELECT COUNT(l.id) INTO v_import_errors
  FROM campaign_import_logs l
  JOIN campaigns c ON l.campaign_id = c.id
  WHERE (p_campaign_id IS NULL OR l.campaign_id = p_campaign_id)
    AND (p_tenant_id IS NULL OR l.tenant_id = p_tenant_id)
    AND (p_agent_id IS NULL OR c.agent_id = p_agent_id);

  -- 3. Métricas de Status (Fonte da Verdade: message_status_history)
  -- Enviados (SENT, DELIVERED, READ, FAILED, REJECTED)
  SELECT COUNT(DISTINCT h.message_id) INTO v_sent_count
  FROM message_status_history h
  JOIN messages m ON h.message_id = m.id
  JOIN campaigns c ON (m.metadata->>'campaign_id')::uuid = c.id
  WHERE h.status IN ('SENT', 'DELIVERED', 'READ', 'FAILED', 'REJECTED')
    AND (p_campaign_id IS NULL OR c.id = p_campaign_id)
    AND (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id)
    AND (p_agent_id IS NULL OR c.agent_id = p_agent_id);

  -- Entregues (DELIVERED, READ)
  SELECT COUNT(DISTINCT h.message_id) INTO v_delivered_count
  FROM message_status_history h
  JOIN messages m ON h.message_id = m.id
  JOIN campaigns c ON (m.metadata->>'campaign_id')::uuid = c.id
  WHERE h.status IN ('DELIVERED', 'READ')
    AND (p_campaign_id IS NULL OR c.id = p_campaign_id)
    AND (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id)
    AND (p_agent_id IS NULL OR c.agent_id = p_agent_id);

  -- Lidas (READ)
  SELECT COUNT(DISTINCT h.message_id) INTO v_read_count
  FROM message_status_history h
  JOIN messages m ON h.message_id = m.id
  JOIN campaigns c ON (m.metadata->>'campaign_id')::uuid = c.id
  WHERE h.status = 'READ'
    AND (p_campaign_id IS NULL OR c.id = p_campaign_id)
    AND (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id)
    AND (p_agent_id IS NULL OR c.agent_id = p_agent_id);

  -- Respostas e Conversões usando outbound_queue
  SELECT 
    COUNT(oq.id) FILTER (WHERE oq.response_detected = true),
    COUNT(oq.id) FILTER (
      WHERE oq.status = 'converted' 
      OR oq.metadata->>'converted' = 'true'
    )
  INTO v_response_count, v_conversion_count
  FROM outbound_queue oq
  JOIN campaigns c ON oq.campaign_id = c.id
  WHERE (p_campaign_id IS NULL OR oq.campaign_id = p_campaign_id)
    AND (p_tenant_id IS NULL OR oq.tenant_id = p_tenant_id)
    AND (p_agent_id IS NULL OR c.agent_id = p_agent_id);

  -- Calcular Taxa de Conversão
  IF v_delivered_count > 0 THEN
    v_conversion_rate := ROUND((v_conversion_count::NUMERIC / v_delivered_count::NUMERIC) * 100, 2);
  END IF;

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
