-- ============================================================
-- RPC: get_campaign_dashboard_stats
-- Descrição: Agrega métricas de performance de campanhas outbound
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
  v_response_count    BIGINT := 0;
  v_delivered_count  BIGINT := 0;
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
  SELECT COUNT(*) INTO v_total_contacts
  FROM outbound_queue
  WHERE (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

  -- Erros de importação
  SELECT COUNT(*) INTO v_import_errors
  FROM campaign_import_logs
  WHERE (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

  -- Enviados
  SELECT COUNT(*) INTO v_sent_count
  FROM outbound_queue
  WHERE (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    AND (status IN ('sent', 'delivered', 'read'));

  -- Entregues (DLR real)
  SELECT COUNT(*) INTO v_delivered_count
  FROM outbound_queue
  WHERE (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    AND (status IN ('delivered', 'read'));

  -- Respostas detectadas
  SELECT COUNT(*) INTO v_response_count
  FROM outbound_queue
  WHERE (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    AND response_detected = true;

  -- 3. Cálculo de Conversão (Sucesso)
  -- Se p_campaign_id for NULL (TOTAL), consideramos sucesso como "Cliente Respondeu" ou "Link Enviado" genérico
  -- Se houver p_campaign_id, usamos os critérios configurados
  
  IF p_campaign_id IS NOT NULL AND v_success_criteria IS NOT NULL AND array_length(v_success_criteria, 1) > 0 THEN
      -- Logica Baseada em Critérios Parametrizados
      SELECT COUNT(DISTINCT oq.id) INTO v_conversion_count
      FROM outbound_queue oq
      WHERE oq.campaign_id = p_campaign_id
        AND (
          -- Critério: Resposta do Cliente
          ('CLIENT_RESPONDED' = ANY(v_success_criteria) AND oq.response_detected = true)
          OR
          -- Critério: Link Enviado (Busca no histórico de mensagens da conversa se existir)
          ('LINK_SENT' = ANY(v_success_criteria) AND EXISTS (
             SELECT 1 FROM messages m 
             JOIN conversations c ON c.id = m.conversation_id
             WHERE c.user_identifier = oq.contact_phone
               AND c.tenant_id = oq.tenant_id
               AND m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system', 'agent')
               AND (v_link_filter IS NULL OR m.content ILIKE '%' || v_link_filter || '%')
          ))
        );
  ELSE
      -- Logica para Dashboard Geral ou Campanha sem critérios (Default: Resposta)
      v_conversion_count := v_response_count;
  END IF;

  -- 4. Taxa de Conversão (Sucesso / Enviados)
  v_conversion_rate := CASE 
    WHEN v_sent_count = 0 THEN 0 
    ELSE ROUND((v_conversion_count::NUMERIC / v_sent_count) * 100, 1)
  END;

  RETURN json_build_object(
    'total_contacts',    v_total_contacts,
    'import_errors',     v_import_errors,
    'sent_count',        v_sent_count,
    'delivered_count',   v_delivered_count,
    'response_count',    v_response_count,
    'conversion_count',  v_conversion_count,
    'conversion_rate',   v_conversion_rate
  );
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION get_campaign_dashboard_stats(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_campaign_dashboard_stats(UUID, UUID) TO service_role;
