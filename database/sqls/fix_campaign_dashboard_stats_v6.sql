-- ============================================================
-- RPC: get_campaign_dashboard_stats
-- Descrição: Agrega métricas de performance de campanhas outbound de forma alinhada com a visualização de detalhes (Lead-based)
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

  -- 2. Erros de importação (Log)
  SELECT COUNT(*) INTO v_import_errors
  FROM campaign_import_logs
  WHERE (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

  -- 3. Métricas Baseadas em Leads (Outbound Queue)
  -- Para garantir que os números do painel principal batam 100% com os detalhes da campanha,
  -- contamos a situação de cada LEAD, não cada mensagem individual (evitando duplicidade).
  WITH EnrichedQueue AS (
    SELECT 
      oq.id,
      oq.response_detected,
      COALESCE(
        (
          SELECT lower(msh.status)
          FROM public.message_status_history msh
          WHERE msh.message_id = (oq.metadata->>'message_id')::uuid
          ORDER BY msh.created_at DESC
          LIMIT 1
        ),
        lower(oq.status::text)
      ) as actual_status
    FROM outbound_queue oq
    WHERE (p_campaign_id IS NULL OR oq.campaign_id = p_campaign_id)
      AND (p_tenant_id IS NULL OR oq.tenant_id = p_tenant_id)
  )
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE actual_status IN ('sent', 'delivered', 'read') OR response_detected = true),
    COUNT(*) FILTER (WHERE actual_status IN ('delivered', 'read') OR response_detected = true),
    COUNT(*) FILTER (WHERE actual_status = 'read' OR response_detected = true),
    COUNT(*) FILTER (WHERE response_detected = true)
  INTO 
    v_total_contacts,
    v_sent_count,
    v_delivered_count,
    v_read_count,
    v_response_count
  FROM EnrichedQueue;

  -- 4. Cálculo de Conversão (Sucesso)
  IF p_campaign_id IS NOT NULL AND v_success_criteria IS NOT NULL AND array_length(v_success_criteria, 1) > 0 THEN
      -- Logica Baseada em Critérios Parametrizados
      SELECT COUNT(DISTINCT oq.id) INTO v_conversion_count
      FROM outbound_queue oq
      WHERE oq.campaign_id = p_campaign_id
        AND (
          -- Critério: Resposta do Cliente
          ('CLIENT_RESPONDED' = ANY(v_success_criteria) AND oq.response_detected = true)
          OR
          -- Critério: Link Enviado
          ('LINK_SENT' = ANY(v_success_criteria) AND EXISTS (
             SELECT 1 FROM messages m 
             JOIN conversations c ON c.id = m.conversation_id
             WHERE c.user_identifier = oq.contact_phone
               AND c.tenant_id = oq.tenant_id
               AND m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system', 'agent')
               AND (v_link_filter IS NULL OR v_link_filter = '' OR m.content ILIKE '%' || v_link_filter || '%')
          ))
        );
  ELSE
      -- Logica Default: Resposta
      v_conversion_count := v_response_count;
  END IF;

  -- 5. Taxa de Conversão (Sucesso / Entregues - Para refletir realidade de funil)
  -- Se usarmos enviados, leads não processados derrubam a taxa injustamente
  v_conversion_rate := CASE 
    WHEN v_delivered_count = 0 THEN 0 
    ELSE ROUND((v_conversion_count::NUMERIC / v_delivered_count) * 100, 1)
  END;

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

-- Permissões
GRANT EXECUTE ON FUNCTION get_campaign_dashboard_stats(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_campaign_dashboard_stats(UUID, UUID) TO service_role;
