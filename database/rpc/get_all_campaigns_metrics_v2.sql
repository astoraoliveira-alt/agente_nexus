-- ============================================================
-- RPC: get_all_campaigns_metrics_v2
-- Descrição: Agrega métricas de performance de campanhas bulk
-- preservando o high-water mark de sucesso do lead nas reinterações.
-- ============================================================
DROP FUNCTION IF EXISTS get_all_campaigns_metrics_v2(UUID);

CREATE OR REPLACE FUNCTION get_all_campaigns_metrics_v2(p_tenant_id UUID)
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
      JOIN public.campaigns c ON c.id = oq.campaign_id
      WHERE oq.tenant_id = p_tenant_id
        AND oq.campaign_id IS NOT NULL
  ),
  conversation_statuses AS (
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id,
        trim(lower(msh.status)) as current_status
      FROM leads_base lb
      JOIN public.messages m ON m.conversation_id = lb.conversation_id
      JOIN public.message_status_history msh ON msh.message_id = m.id
      WHERE m.sender_type IN ('ai', 'bot', 'assistant', 'system', 'agent', 'system_trigger')
      ORDER BY 
        m.conversation_id,
        CASE lower(msh.status)
          WHEN 'read' THEN 1
          WHEN 'lida' THEN 1
          WHEN 'converted' THEN 2
          WHEN 'delivered' THEN 3
          WHEN 'entregue' THEN 3
          WHEN 'sent' THEN 4
          WHEN 'enviada' THEN 4
          ELSE 5
        END ASC,
        msh.created_at DESC
  ),
  conversation_metrics AS (
      SELECT 
        lb.id as lead_id,
        bool_or(m.sender_type = 'user' AND m.direction = 'inbound') as has_response,
        bool_or(m.content ILIKE '%✅ [CONVERSÃO]: O usuário%clicou no botão e foi redirecionado.%') as has_button_conversion_tag,
        MIN(CASE WHEN m.content ILIKE '%✅ [CONVERSÃO]: O usuário%clicou no botão e foi redirecionado.%' THEN m.created_at END) as first_button_click_at,
        MIN(CASE WHEN m.sender_type = 'user' THEN m.created_at END) as first_user_message_at,
        bool_or(m.content ILIKE '%[CONVERSÃO]%' OR m.content ILIKE '%✅ [CONVERSÃO]%') as has_conversion_tag,
        bool_or(
           m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system') 
           AND COALESCE(lb.success_link_filter, '') <> ''
           AND m.content ILIKE '%' || lb.success_link_filter || '%'
        ) as has_link_sent_match
      FROM leads_base lb
      JOIN public.messages m ON m.conversation_id = lb.conversation_id
      WHERE (lb.sent_at IS NULL OR m.created_at >= lb.sent_at)
      GROUP BY lb.id
  ),
  leads_enriched AS (
      SELECT 
        lb.*,
        COALESCE(cs.current_status, trim(lower(lb.status))) as current_status,
        COALESCE(cm.has_response, FALSE) as has_response,
        (COALESCE(cm.has_button_conversion_tag, FALSE) = TRUE AND (cm.first_user_message_at IS NULL OR cm.first_user_message_at >= cm.first_button_click_at)) as clicked_button,
        (
            CASE 
              WHEN trim(lower(COALESCE(cs.current_status, lb.status))) = 'converted' 
                   OR (lb.metadata->>'converted') = 'true' 
                   OR COALESCE(cm.has_conversion_tag, FALSE) = TRUE THEN TRUE
              WHEN 'CLIENT_RESPONDED' = ANY(lb.success_criteria) THEN COALESCE(cm.has_response, FALSE)
              WHEN 'LINK_SENT' = ANY(lb.success_criteria) AND COALESCE(lb.success_link_filter, '') <> '' THEN 
                   COALESCE(cm.has_link_sent_match, FALSE) OR COALESCE(cm.has_conversion_tag, FALSE)
              ELSE FALSE
            END
        ) as is_converted
      FROM leads_base lb
      LEFT JOIN conversation_statuses cs ON cs.conversation_id = lb.conversation_id
      LEFT JOIN conversation_metrics cm ON cm.lead_id = lb.id
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
        COUNT(*) FILTER (WHERE is_converted = TRUE AND clicked_button = TRUE) as conversion_button_count,
        COUNT(*) FILTER (WHERE is_converted = TRUE AND clicked_button = FALSE) as conversion_chat_count,
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
    CASE WHEN mg.delivered_count > 0 THEN ROUND((mg.conversion_count::NUMERIC / mg.delivered_count) * 100, 1) ELSE 0 END as conversion_rate
  FROM metrics_grouped mg
  LEFT JOIN errors_grouped eg ON eg.campaign_id = mg.campaign_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_campaigns_metrics_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_campaigns_metrics_v2(UUID) TO service_role;
