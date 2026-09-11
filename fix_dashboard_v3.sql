-- 1. FUNÇÃO BULK (Para a tela geral de campanhas - 100% Precisa e Ultra Rápida)
CREATE OR REPLACE FUNCTION public.get_all_campaigns_metrics_v2(p_tenant_id uuid)
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
AS $function$
BEGIN
  RETURN QUERY
  WITH leads_base AS (
      SELECT 
        oq.campaign_id,
        oq.status,
        oq.response_detected,
        oq.metadata,
        c.success_criteria
      FROM public.outbound_queue oq
      JOIN public.campaigns c ON c.id = oq.campaign_id
      WHERE oq.tenant_id = p_tenant_id
        AND oq.campaign_id IS NOT NULL
  ),
  leads_enriched AS (
      SELECT 
        lb.campaign_id,
        COALESCE(msh.status, trim(lower(lb.status))) as current_status,
        COALESCE(lb.response_detected, FALSE) as has_response,
        (
            CASE 
              WHEN COALESCE(msh.status, trim(lower(lb.status))) = 'converted' 
                   OR (lb.metadata->>'converted') = 'true' 
                   THEN TRUE
              WHEN 'CLIENT_RESPONDED' = ANY(lb.success_criteria) THEN COALESCE(lb.response_detected, FALSE)
              ELSE FALSE
            END
        ) as is_converted
      FROM leads_base lb
      LEFT JOIN LATERAL (
          SELECT trim(lower(status)) as status
          FROM public.message_status_history
          WHERE message_id = (lb.metadata->>'message_id')::uuid
          ORDER BY 
            CASE lower(status)
              WHEN 'read' THEN 1
              WHEN 'lida' THEN 1
              WHEN 'converted' THEN 2
              WHEN 'delivered' THEN 3
              WHEN 'entregue' THEN 3
              WHEN 'sent' THEN 4
              WHEN 'enviada' THEN 4
              ELSE 5
            END ASC, created_at DESC
          LIMIT 1
      ) msh ON (lb.metadata->>'message_id') IS NOT NULL
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
        0::bigint as conversion_button_count,
        COUNT(*) FILTER (WHERE is_converted = TRUE) as conversion_chat_count,
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
    mg.conversion_button_count,
    mg.conversion_chat_count,
    mg.failed_count,
    COALESCE(eg.import_errors, 0)::bigint as import_errors,
    (CASE WHEN mg.delivered_count > 0 THEN ROUND((mg.conversion_count::NUMERIC / mg.delivered_count) * 100, 1) ELSE 0 END)::numeric as conversion_rate
  FROM metrics_grouped mg
  LEFT JOIN errors_grouped eg ON eg.campaign_id = mg.campaign_id;
END;
$function$;
