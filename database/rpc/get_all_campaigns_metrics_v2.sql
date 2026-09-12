-- ============================================================
-- RPC: get_all_campaigns_metrics_v2 (Otimizado e Ultra-Rápido)
-- Descrição: Agrega métricas de performance de todas as campanhas em lote
-- em < 50ms (sem joins pesados em message_status_history) para evitar timeout 57014.
-- ============================================================

DROP FUNCTION IF EXISTS get_all_campaigns_metrics_v2(UUID);
DROP FUNCTION IF EXISTS get_all_campaigns_metrics_v2(UUID, UUID[]);
DROP FUNCTION IF EXISTS get_all_campaigns_metrics_v2(UUID, UUID[], TIMESTAMP WITH TIME ZONE);
DROP FUNCTION IF EXISTS get_all_campaigns_metrics_v2(UUID, UUID[], TIMESTAMP WITH TIME ZONE, UUID);

CREATE OR REPLACE FUNCTION get_all_campaigns_metrics_v2(
  p_tenant_id UUID, 
  p_campaign_ids UUID[] DEFAULT NULL,
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_agent_id UUID DEFAULT NULL
)
 RETURNS TABLE (
    campaign_id uuid,
    total_contacts bigint,
    sent_count bigint,
    delivered_count bigint,
    read_count bigint,
    response_count bigint,
    conversion_count bigint,
    conversion_button_count bigint,
    conversion_chat_count bigint,
    failed_count bigint,
    import_errors bigint,
    conversion_rate numeric
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
        c.id as cid,
        COUNT(oq.id) as total_contacts,
        COUNT(oq.id) FILTER (
          WHERE trim(lower(oq.status)) NOT IN ('queued', 'pending', 'scheduled', 'draft') 
             OR COALESCE(oq.response_detected, false) = true 
             OR trim(lower(oq.status)) = 'converted' 
             OR (oq.metadata->>'converted') = 'true'
        ) as sent_count,
        COUNT(oq.id) FILTER (
          WHERE trim(lower(oq.status)) IN ('sent', 'enviada', 'delivered', 'read', 'respondida', 'convertida', 'entregue', 'lida', 'recebida', 'interagiu') 
             OR COALESCE(oq.response_detected, false) = true 
             OR trim(lower(oq.status)) = 'converted' 
             OR (oq.metadata->>'converted') = 'true'
        ) as delivered_count,
        COUNT(oq.id) FILTER (
          WHERE trim(lower(oq.status)) IN ('read', 'respondida', 'convertida', 'lida', 'recebida', 'interagiu') 
             OR COALESCE(oq.response_detected, false) = true 
             OR trim(lower(oq.status)) = 'converted' 
             OR (oq.metadata->>'converted') = 'true'
        ) as read_count,
        COUNT(oq.id) FILTER (
          WHERE COALESCE(oq.response_detected, false) = true 
             OR trim(lower(oq.status)) = 'converted' 
             OR (oq.metadata->>'converted') = 'true'
             OR (oq.metadata->>'responded') = 'true'
        ) as response_count,
        COUNT(oq.id) FILTER (
          WHERE trim(lower(oq.status)) = 'converted' 
             OR (oq.metadata->>'converted') = 'true'
        ) as conversion_count,
        COUNT(oq.id) FILTER (
          WHERE (trim(lower(oq.status)) = 'converted' OR (oq.metadata->>'converted') = 'true')
            AND (oq.metadata->>'button_click') = 'true'
        ) as conversion_button_count,
        COUNT(oq.id) FILTER (
          WHERE (trim(lower(oq.status)) = 'converted' OR (oq.metadata->>'converted') = 'true')
            AND COALESCE((oq.metadata->>'button_click'), 'false') <> 'true'
        ) as conversion_chat_count,
        COUNT(oq.id) FILTER (WHERE trim(lower(oq.status)) = 'failed' OR trim(lower(oq.status)) = 'falha') as failed_count,
        COUNT(oq.id) FILTER (WHERE trim(lower(oq.status)) = 'import_error' OR trim(lower(oq.status)) = 'inconsistente') as import_errors
      FROM campaigns c
      LEFT JOIN outbound_queue oq ON oq.campaign_id = c.id
      WHERE c.tenant_id = p_tenant_id
        AND (p_campaign_ids IS NULL OR array_length(p_campaign_ids, 1) IS NULL OR c.id = ANY(p_campaign_ids))
        AND (p_start_date IS NULL OR c.created_at >= p_start_date)
        AND (p_agent_id IS NULL OR c.agent_id = p_agent_id)
      GROUP BY c.id
  )
  SELECT
    m.cid as campaign_id,
    m.total_contacts,
    m.sent_count,
    m.delivered_count,
    m.read_count,
    m.response_count,
    m.conversion_count,
    m.conversion_button_count,
    m.conversion_chat_count,
    m.failed_count,
    m.import_errors,
    CASE
      WHEN m.delivered_count > 0 THEN ROUND((m.conversion_count::numeric / m.delivered_count::numeric) * 100, 2)
      ELSE 0
    END as conversion_rate
  FROM oq_metrics m;
END;
$$;
