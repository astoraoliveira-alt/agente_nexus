-- ============================================================
-- RPC: get_campaign_metrics_v2
-- Descrição: Agrega métricas de performance de campanhas outbound
-- com isolamento temporal para evitar ruído de conversas antigas.
-- ============================================================

DROP FUNCTION IF EXISTS get_campaign_metrics_v2(UUID, UUID);

CREATE OR REPLACE FUNCTION get_campaign_metrics_v2(
  p_campaign_id UUID DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH leads_base AS (
      SELECT 
        oq.id,
        oq.status,
        oq.sent_at,
        oq.conversation_id,
        oq.response_detected as raw_response,
        oq.metadata,
        c.success_criteria,
        c.success_link_filter
      FROM public.outbound_queue oq
      LEFT JOIN public.campaigns c ON c.id = oq.campaign_id
      WHERE (p_campaign_id IS NULL OR oq.campaign_id = p_campaign_id)
        AND (p_tenant_id IS NULL OR oq.tenant_id = p_tenant_id)
  ),
  leads_with_status AS (
      SELECT 
        lb.*,
        COALESCE(
          (
            -- Pega o status mais avançado de QUALQUER mensagem outbound enviada para esse lead na conversa
            -- Isso garante que um reengajamento não rebaixe um status anterior
            SELECT trim(lower(msh.status))
            FROM public.messages m
            JOIN public.message_status_history msh ON msh.message_id = m.id
            WHERE m.conversation_id = lb.conversation_id
              AND m.sender_type IN ('ai', 'bot', 'assistant', 'system', 'agent', 'system_trigger')
            ORDER BY 
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
  metrics AS (
      SELECT
        COUNT(*) as total_contacts,
        -- Enviados: Tudo o que saiu da nossa infra (incluindo falhas de entrega do provedor)
        COUNT(*) FILTER (WHERE current_status NOT IN ('queued', 'pending', 'scheduled', 'draft') OR has_response = TRUE OR is_converted = TRUE) as sent_count,
        -- Entregues: O que de fato chegou (ou teve interação)
        COUNT(*) FILTER (WHERE current_status IN ('sent', 'enviada', 'delivered', 'read', 'respondida', 'convertida', 'entregue', 'lida', 'recebida', 'interagiu') OR has_response = TRUE OR is_converted = TRUE) as delivered_count,
        COUNT(*) FILTER (WHERE current_status IN ('read', 'respondida', 'convertida', 'lida', 'recebida', 'interagiu') OR has_response = TRUE OR is_converted = TRUE) as read_count,
        COUNT(*) FILTER (WHERE has_response = TRUE OR is_converted = TRUE) as response_count,
        COUNT(*) FILTER (WHERE is_converted = TRUE) as conversion_count,
        COUNT(*) FILTER (WHERE current_status IN ('failed', 'erro', 'falha', 'rejeitada', 'rejected')) as failed_count
      FROM leads_enriched
  )
  SELECT 
    jsonb_build_object(
      'total_contacts', m.total_contacts,
      'sent_count', m.sent_count,
      'delivered_count', m.delivered_count,
      'read_count', m.read_count,
      'response_count', m.response_count,
      'conversion_count', m.conversion_count,
      'failed_count', m.failed_count,
      'import_errors', (
          SELECT COUNT(*) 
          FROM public.campaign_import_logs 
          WHERE (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
            AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
      ),
      'conversion_rate', CASE WHEN m.delivered_count > 0 THEN ROUND((m.conversion_count::NUMERIC / m.delivered_count) * 100, 1) ELSE 0 END,
      'success_criteria_used', (SELECT success_criteria FROM public.campaigns WHERE id = p_campaign_id LIMIT 1)
    ) INTO v_result
  FROM metrics m;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_campaign_metrics_v2(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_campaign_metrics_v2(UUID, UUID) TO service_role;
