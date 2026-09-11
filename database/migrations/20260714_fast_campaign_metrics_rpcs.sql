-- ==============================================================================
-- MIGRATION: Otimização Ultra-Rápida do Painel de Campanhas (Sem Joins Pesados)
-- Data: 14/07/2026
-- Descrição: Substitui as funções get_all_campaigns_metrics_v2 e get_campaign_metrics_v2
-- por versões otimizadas (< 50ms) que leem diretamente da tabela outbound_queue.
-- Isso elimina o erro 57014 (Statement Timeout) e popula todas as colunas
-- (Entregues, Lidas, Conversão e Taxa) instantaneamente na tela.
-- ==============================================================================

-- 1. RPC: get_all_campaigns_metrics_v2
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
  WITH oq_metrics AS (
      SELECT
        oq.campaign_id,
        COUNT(*) as total_contacts,
        COUNT(*) FILTER (
          WHERE trim(lower(oq.status)) NOT IN ('queued', 'pending', 'scheduled', 'draft') 
             OR COALESCE(oq.response_detected, false) = true 
             OR trim(lower(oq.status)) = 'converted' 
             OR (oq.metadata->>'converted') = 'true'
        ) as sent_count,
        COUNT(*) FILTER (
          WHERE trim(lower(oq.status)) IN ('sent', 'enviada', 'delivered', 'read', 'respondida', 'convertida', 'entregue', 'lida', 'recebida', 'interagiu') 
             OR COALESCE(oq.response_detected, false) = true 
             OR trim(lower(oq.status)) = 'converted' 
             OR (oq.metadata->>'converted') = 'true'
        ) as delivered_count,
        COUNT(*) FILTER (
          WHERE trim(lower(oq.status)) IN ('read', 'respondida', 'convertida', 'lida', 'recebida', 'interagiu') 
             OR COALESCE(oq.response_detected, false) = true 
             OR trim(lower(oq.status)) = 'converted' 
             OR (oq.metadata->>'converted') = 'true'
        ) as read_count,
        COUNT(*) FILTER (
          WHERE COALESCE(oq.response_detected, false) = true 
             OR trim(lower(oq.status)) = 'converted' 
             OR (oq.metadata->>'converted') = 'true'
             OR (oq.metadata->>'responded') = 'true'
        ) as response_count,
        COUNT(*) FILTER (
          WHERE trim(lower(oq.status)) = 'converted' 
             OR (oq.metadata->>'converted') = 'true'
        ) as conversion_count,
        COUNT(*) FILTER (
          WHERE (trim(lower(oq.status)) = 'converted' OR (oq.metadata->>'converted') = 'true')
            AND (oq.metadata->>'button_click') = 'true'
        ) as conversion_button_count,
        COUNT(*) FILTER (
          WHERE (trim(lower(oq.status)) = 'converted' OR (oq.metadata->>'converted') = 'true')
            AND COALESCE((oq.metadata->>'button_click'), 'false') <> 'true'
        ) as conversion_chat_count,
        COUNT(*) FILTER (
          WHERE trim(lower(oq.status)) IN ('failed', 'erro', 'falha', 'rejeitada', 'rejected', 'not_delivered')
        ) as failed_count
      FROM public.outbound_queue oq
      WHERE oq.tenant_id = p_tenant_id
        AND oq.campaign_id IS NOT NULL
      GROUP BY oq.campaign_id
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
    c.id as campaign_id,
    GREATEST(COALESCE(om.total_contacts, 0), COALESCE(c.total_contacts, 0))::bigint as total_contacts,
    GREATEST(COALESCE(om.sent_count, 0), COALESCE(c.sent_count, 0))::bigint as sent_count,
    GREATEST(COALESCE(om.delivered_count, 0), COALESCE(c.delivered_count, 0))::bigint as delivered_count,
    GREATEST(COALESCE(om.read_count, 0), COALESCE(c.read_count, 0))::bigint as read_count,
    GREATEST(COALESCE(om.response_count, 0), COALESCE(c.response_count, 0))::bigint as response_count,
    GREATEST(COALESCE(om.conversion_count, 0), COALESCE(c.conversion_count, 0))::bigint as conversion_count,
    COALESCE(om.conversion_button_count, 0)::bigint as conversion_button_count,
    COALESCE(om.conversion_chat_count, 0)::bigint as conversion_chat_count,
    GREATEST(COALESCE(om.failed_count, 0), COALESCE(c.failed_count, 0))::bigint as failed_count,
    COALESCE(eg.import_errors, COALESCE(c.import_error_count, 0))::bigint as import_errors,
    CASE 
      WHEN GREATEST(COALESCE(om.delivered_count, 0), COALESCE(c.delivered_count, 0)) > 0 THEN 
        ROUND((GREATEST(COALESCE(om.conversion_count, 0), COALESCE(c.conversion_count, 0))::NUMERIC / GREATEST(COALESCE(om.delivered_count, 0), COALESCE(c.delivered_count, 0))) * 100, 1) 
      ELSE 0 
    END as conversion_rate
  FROM public.campaigns c
  LEFT JOIN oq_metrics om ON om.campaign_id = c.id
  LEFT JOIN errors_grouped eg ON eg.campaign_id = c.id
  WHERE c.tenant_id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_campaigns_metrics_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_campaigns_metrics_v2(UUID) TO service_role;


-- 2. RPC: get_campaign_metrics_v2
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
  WITH oq_metrics AS (
      SELECT
        COUNT(*) as total_contacts,
        COUNT(*) FILTER (
          WHERE trim(lower(oq.status)) NOT IN ('queued', 'pending', 'scheduled', 'draft') 
             OR COALESCE(oq.response_detected, false) = true 
             OR trim(lower(oq.status)) = 'converted' 
             OR (oq.metadata->>'converted') = 'true'
        ) as sent_count,
        COUNT(*) FILTER (
          WHERE trim(lower(oq.status)) IN ('sent', 'enviada', 'delivered', 'read', 'respondida', 'convertida', 'entregue', 'lida', 'recebida', 'interagiu') 
             OR COALESCE(oq.response_detected, false) = true 
             OR trim(lower(oq.status)) = 'converted' 
             OR (oq.metadata->>'converted') = 'true'
        ) as delivered_count,
        COUNT(*) FILTER (
          WHERE trim(lower(oq.status)) IN ('read', 'respondida', 'convertida', 'lida', 'recebida', 'interagiu') 
             OR COALESCE(oq.response_detected, false) = true 
             OR trim(lower(oq.status)) = 'converted' 
             OR (oq.metadata->>'converted') = 'true'
        ) as read_count,
        COUNT(*) FILTER (
          WHERE COALESCE(oq.response_detected, false) = true 
             OR trim(lower(oq.status)) = 'converted' 
             OR (oq.metadata->>'converted') = 'true'
             OR (oq.metadata->>'responded') = 'true'
        ) as response_count,
        COUNT(*) FILTER (
          WHERE trim(lower(oq.status)) = 'converted' 
             OR (oq.metadata->>'converted') = 'true'
        ) as conversion_count,
        COUNT(*) FILTER (
          WHERE (trim(lower(oq.status)) = 'converted' OR (oq.metadata->>'converted') = 'true')
            AND (oq.metadata->>'button_click') = 'true'
        ) as conversion_button_count,
        COUNT(*) FILTER (
          WHERE (trim(lower(oq.status)) = 'converted' OR (oq.metadata->>'converted') = 'true')
            AND COALESCE((oq.metadata->>'button_click'), 'false') <> 'true'
        ) as conversion_chat_count,
        COUNT(*) FILTER (
          WHERE trim(lower(oq.status)) IN ('failed', 'erro', 'falha', 'rejeitada', 'rejected', 'not_delivered')
        ) as failed_count
      FROM public.outbound_queue oq
      WHERE (p_campaign_id IS NULL OR oq.campaign_id = p_campaign_id)
        AND (p_tenant_id IS NULL OR oq.tenant_id = p_tenant_id)
  )
  SELECT 
    jsonb_build_object(
      'total_contacts', GREATEST(COALESCE(m.total_contacts, 0), COALESCE(c.total_contacts, 0)),
      'sent_count', GREATEST(COALESCE(m.sent_count, 0), COALESCE(c.sent_count, 0)),
      'delivered_count', GREATEST(COALESCE(m.delivered_count, 0), COALESCE(c.delivered_count, 0)),
      'read_count', GREATEST(COALESCE(m.read_count, 0), COALESCE(c.read_count, 0)),
      'response_count', GREATEST(COALESCE(m.response_count, 0), COALESCE(c.response_count, 0)),
      'conversion_count', GREATEST(COALESCE(m.conversion_count, 0), COALESCE(c.conversion_count, 0)),
      'conversion_button_count', COALESCE(m.conversion_button_count, 0),
      'conversion_chat_count', COALESCE(m.conversion_chat_count, 0),
      'failed_count', GREATEST(COALESCE(m.failed_count, 0), COALESCE(c.failed_count, 0)),
      'import_errors', COALESCE((
          SELECT COUNT(*) 
          FROM public.campaign_import_logs 
          WHERE (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
            AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
      ), COALESCE(c.import_error_count, 0)),
      'conversion_rate', CASE 
        WHEN GREATEST(COALESCE(m.delivered_count, 0), COALESCE(c.delivered_count, 0)) > 0 THEN 
          ROUND((GREATEST(COALESCE(m.conversion_count, 0), COALESCE(c.conversion_count, 0))::NUMERIC / GREATEST(COALESCE(m.delivered_count, 0), COALESCE(c.delivered_count, 0))) * 100, 1) 
        ELSE 0 
      END,
      'success_criteria_used', COALESCE(c.success_criteria, ARRAY[]::text[])
    ) INTO v_result
  FROM public.campaigns c
  LEFT JOIN oq_metrics m ON true
  WHERE c.id = p_campaign_id;

  RETURN COALESCE(v_result, jsonb_build_object(
      'total_contacts', 0, 'sent_count', 0, 'delivered_count', 0,
      'read_count', 0, 'response_count', 0, 'conversion_count', 0,
      'conversion_button_count', 0, 'conversion_chat_count', 0,
      'failed_count', 0, 'import_errors', 0, 'conversion_rate', 0,
      'success_criteria_used', ARRAY[]::text[]
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION get_campaign_metrics_v2(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_campaign_metrics_v2(UUID, UUID) TO service_role;
