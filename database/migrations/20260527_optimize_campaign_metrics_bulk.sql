-- ============================================================
-- RPC: get_all_campaigns_metrics_v2
-- Descrição: Agrega métricas de performance de TODAS as campanhas outbound
-- de um tenant em uma única query agrupada.
-- ============================================================

CREATE OR REPLACE FUNCTION get_all_campaigns_metrics_v2(
  p_tenant_id UUID
)
RETURNS TABLE (
  campaign_id UUID,
  total_contacts BIGINT,
  sent_count BIGINT,
  delivered_count BIGINT,
  read_count BIGINT,
  response_count BIGINT,
  conversion_count BIGINT,
  failed_count BIGINT,
  import_errors BIGINT,
  conversion_rate NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH leads_base AS (
      SELECT 
        oq.id,
        oq.status,
        oq.sent_at,
        oq.conversation_id,
        oq.response_detected as raw_response,
        oq.metadata,
        c.success_criteria,
        c.success_link_filter,
        oq.campaign_id
      FROM public.outbound_queue oq
      LEFT JOIN public.campaigns c ON c.id = oq.campaign_id
      WHERE oq.tenant_id = p_tenant_id
        AND oq.campaign_id IS NOT NULL
  ),
  leads_with_status AS (
      SELECT 
        lb.*,
        COALESCE(
          (
            SELECT trim(lower(msh.status))
            FROM public.message_status_history msh
            WHERE msh.message_id = (lb.metadata->>'message_id')::uuid
            ORDER BY msh.created_at DESC
            LIMIT 1
          ),
          trim(lower(lb.status))
        ) as current_status
      FROM leads_base lb
  ),
  leads_enriched AS (
      SELECT 
        lws.*,
        -- Resposta detectada APÓS o envio
        EXISTS (
            SELECT 1 FROM public.messages m
            WHERE m.conversation_id = lws.conversation_id
              AND m.sender_type = 'user'
              AND m.direction = 'inbound'
              AND (lws.sent_at IS NULL OR m.created_at >= lws.sent_at)
        ) as has_response,
        -- Conversão APÓS o envio
        (
            CASE 
              -- Conversão explícita pelo clique do link direto (status na fila ou log do sistema)
              WHEN trim(lower(lws.status)) = 'converted' 
                   OR (lws.metadata->>'converted') = 'true' 
                   OR EXISTS (
                       SELECT 1 FROM public.messages m
                       WHERE m.conversation_id = lws.conversation_id
                         AND m.content ILIKE '%[CONVERSÃO]%'
                         AND (lws.sent_at IS NULL OR m.created_at >= lws.sent_at)
                   ) THEN TRUE
              WHEN 'CLIENT_RESPONDED' = ANY(lws.success_criteria) THEN
                EXISTS (
                    SELECT 1 FROM public.messages m
                    WHERE m.conversation_id = lws.conversation_id
                      AND m.sender_type = 'user'
                      AND m.direction = 'inbound'
                      AND (lws.sent_at IS NULL OR m.created_at >= lws.sent_at)
                )
              WHEN 'LINK_SENT' = ANY(lws.success_criteria) AND COALESCE(lws.success_link_filter, '') <> '' THEN
                EXISTS (
                    SELECT 1 FROM public.messages m
                    WHERE m.conversation_id = lws.conversation_id
                      AND m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system')
                      AND m.content ILIKE '%' || lws.success_link_filter || '%'
                      AND (lws.sent_at IS NULL OR m.created_at >= lws.sent_at)
                )
              ELSE FALSE
            END
        ) as is_converted
      FROM leads_with_status lws
  ),
  metrics_grouped AS (
      SELECT
        le.campaign_id,
        COUNT(*) as total_contacts,
        COUNT(*) FILTER (WHERE current_status NOT IN ('queued', 'pending', 'scheduled', 'draft') OR has_response = TRUE OR is_converted = TRUE) as sent_count,
        COUNT(*) FILTER (WHERE current_status IN ('sent', 'enviada', 'delivered', 'read', 'respondida', 'convertida', 'entregue', 'lida', 'recebida', 'interagiu') OR has_response = TRUE OR is_converted = TRUE) as delivered_count,
        COUNT(*) FILTER (WHERE current_status IN ('read', 'respondida', 'convertida', 'lida', 'recebida', 'interagiu') OR has_response = TRUE OR is_converted = TRUE) as read_count,
        COUNT(*) FILTER (WHERE has_response = TRUE OR is_converted = TRUE) as response_count,
        COUNT(*) FILTER (WHERE is_converted = TRUE) as conversion_count,
        COUNT(*) FILTER (WHERE current_status IN ('failed', 'erro', 'falha', 'rejeitada', 'rejected')) as failed_count
      FROM leads_enriched le
      GROUP BY le.campaign_id
  ),
  errors_grouped AS (
      SELECT 
        cil.campaign_id,
        COUNT(*) as import_errors
      FROM public.campaign_import_logs cil
      WHERE cil.tenant_id = p_tenant_id
      GROUP BY cil.campaign_id
  )
  SELECT 
    mg.campaign_id,
    mg.total_contacts,
    mg.sent_count,
    mg.delivered_count,
    mg.read_count,
    mg.response_count,
    mg.conversion_count,
    mg.failed_count,
    COALESCE(eg.import_errors, 0) as import_errors,
    CASE WHEN mg.delivered_count > 0 THEN ROUND((mg.conversion_count::NUMERIC / mg.delivered_count) * 100, 1) ELSE 0 END as conversion_rate
  FROM metrics_grouped mg
  LEFT JOIN errors_grouped eg ON eg.campaign_id = mg.campaign_id;
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION get_all_campaigns_metrics_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_campaigns_metrics_v2(UUID) TO service_role;
