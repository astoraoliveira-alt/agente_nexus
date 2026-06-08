-- ============================================================
-- MIGRATION: Otimização de Performance nas RPCs de Campanhas
-- Problema: As funções originais executavam subqueries correlacionadas (EXISTS)
-- para CADA registro da fila de outbound (outbound_queue), causando lentidão 
-- massiva no carregamento do dashboard quando a tabela continha milhares de registros.
-- Solução: Utilização de JOINs e CTEs com agregações (bool_or, DISTINCT ON) em massa.
-- ============================================================

-- ============================================================
-- 1. get_all_campaigns_metrics_v2
-- ============================================================
DROP FUNCTION IF EXISTS get_all_campaigns_metrics_v2(UUID);

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
  conversion_button_count BIGINT,
  conversion_chat_count BIGINT,
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
        oq.campaign_id,
        NULLIF(oq.metadata->>'message_id', '')::uuid as message_id
      FROM public.outbound_queue oq
      LEFT JOIN public.campaigns c ON c.id = oq.campaign_id
      WHERE oq.tenant_id = p_tenant_id
        AND oq.campaign_id IS NOT NULL
  ),
  message_statuses AS (
      SELECT DISTINCT ON (msh.message_id)
        msh.message_id,
        trim(lower(msh.status)) as current_status
      FROM public.message_status_history msh
      WHERE msh.message_id IN (SELECT message_id FROM leads_base WHERE message_id IS NOT NULL)
      ORDER BY msh.message_id, msh.created_at DESC
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
        COALESCE(ms.current_status, trim(lower(lb.status))) as current_status,
        COALESCE(cm.has_response, FALSE) as has_response,
        (COALESCE(cm.has_button_conversion_tag, FALSE) = TRUE AND (cm.first_user_message_at IS NULL OR cm.first_user_message_at >= cm.first_button_click_at)) as clicked_button,
        (
            CASE 
              WHEN trim(lower(COALESCE(ms.current_status, lb.status))) = 'converted' 
                   OR (lb.metadata->>'converted') = 'true' 
                   OR COALESCE(cm.has_conversion_tag, FALSE) = TRUE THEN TRUE
              WHEN 'CLIENT_RESPONDED' = ANY(lb.success_criteria) THEN COALESCE(cm.has_response, FALSE)
              WHEN 'LINK_SENT' = ANY(lb.success_criteria) AND COALESCE(lb.success_link_filter, '') <> '' THEN 
                   COALESCE(cm.has_link_sent_match, FALSE) OR COALESCE(cm.has_conversion_tag, FALSE)
              ELSE FALSE
            END
        ) as is_converted
      FROM leads_base lb
      LEFT JOIN message_statuses ms ON ms.message_id = lb.message_id
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
    COALESCE(eg.import_errors, 0) as import_errors,
    CASE WHEN mg.delivered_count > 0 THEN ROUND((mg.conversion_count::NUMERIC / mg.delivered_count) * 100, 1) ELSE 0 END as conversion_rate
  FROM metrics_grouped mg
  LEFT JOIN errors_grouped eg ON eg.campaign_id = mg.campaign_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_campaigns_metrics_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_campaigns_metrics_v2(UUID) TO service_role;


-- ============================================================
-- 2. get_campaign_metrics_v2
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
  conversation_statuses AS (
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id,
        trim(lower(msh.status)) as current_status
      FROM public.messages m
      JOIN public.message_status_history msh ON msh.message_id = m.id
      WHERE m.conversation_id IN (SELECT conversation_id FROM leads_base WHERE conversation_id IS NOT NULL)
        AND m.sender_type IN ('ai', 'bot', 'assistant', 'system', 'agent', 'system_trigger')
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
  metrics AS (
      SELECT
        COUNT(*) as total_contacts,
        COUNT(*) FILTER (WHERE current_status NOT IN ('queued', 'pending', 'scheduled', 'draft') OR has_response = TRUE OR is_converted = TRUE) as sent_count,
        COUNT(*) FILTER (WHERE current_status IN ('sent', 'enviada', 'delivered', 'read', 'respondida', 'convertida', 'entregue', 'lida', 'recebida', 'interagiu') OR has_response = TRUE OR is_converted = TRUE) as delivered_count,
        COUNT(*) FILTER (WHERE current_status IN ('read', 'respondida', 'convertida', 'lida', 'recebida', 'interagiu') OR has_response = TRUE OR is_converted = TRUE) as read_count,
        COUNT(*) FILTER (WHERE has_response = TRUE OR is_converted = TRUE) as response_count,
        COUNT(*) FILTER (WHERE is_converted = TRUE) as conversion_count,
        COUNT(*) FILTER (WHERE is_converted = TRUE AND clicked_button = TRUE) as conversion_button_count,
        COUNT(*) FILTER (WHERE is_converted = TRUE AND clicked_button = FALSE) as conversion_chat_count,
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
      'conversion_button_count', m.conversion_button_count,
      'conversion_chat_count', m.conversion_chat_count,
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


-- ============================================================
-- 3. get_campaign_leads_enriched
-- ============================================================
DROP FUNCTION IF EXISTS get_campaign_leads_enriched(UUID, UUID);

CREATE OR REPLACE FUNCTION get_campaign_leads_enriched(
  p_tenant_id UUID,
  p_campaign_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  contact_phone TEXT,
  contact_name TEXT,
  status TEXT,
  metadata JSONB,
  cnpj TEXT,
  establishment_name TEXT,
  error_message TEXT,
  response_detected BOOLEAN,
  is_converted BOOLEAN
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
        oq.id as lead_id,
        oq.contact_phone,
        oq.contact_name,
        oq.metadata,
        oq.tenant_id,
        oq.campaign_id,
        oq.error_message,
        oq.conversation_id,
        oq.sent_at,
        oq.status as raw_status,
        c.success_criteria,
        c.success_link_filter,
        NULLIF(oq.metadata->>'message_id', '')::uuid as message_id
      FROM public.outbound_queue oq
      LEFT JOIN public.campaigns c ON c.id = oq.campaign_id
      WHERE oq.tenant_id = p_tenant_id
        AND (p_campaign_id IS NULL OR oq.campaign_id = p_campaign_id)
  ),
  message_statuses AS (
      SELECT DISTINCT ON (msh.message_id)
        msh.message_id,
        trim(lower(msh.status)) as current_status
      FROM public.message_status_history msh
      WHERE msh.message_id IN (SELECT message_id FROM leads_base WHERE message_id IS NOT NULL)
      ORDER BY msh.message_id, msh.created_at DESC
  ),
  conversation_metrics AS (
      SELECT 
        lb.lead_id,
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
      GROUP BY lb.lead_id
  )
  SELECT 
    lb.lead_id as id,
    lb.contact_phone::text,
    lb.contact_name::text,
    COALESCE(ms.current_status, lb.raw_status::text) as status,
    lb.metadata,
    COALESCE(
      (lb.metadata->>'cnpj')::text, 
      (
        SELECT al.identifier::text
        FROM public.agent_leads al 
        WHERE al.tenant_id = lb.tenant_id 
          AND (
            al.whatsapp = lb.contact_phone 
            OR regexp_replace(al.whatsapp, '^55', '') = regexp_replace(lb.contact_phone, '^55', '')
          )
        LIMIT 1
      )
    ) as cnpj,
    COALESCE(
      (lb.metadata->>'razao_social')::text,
      (
        SELECT trim(al.name)::text
        FROM public.agent_leads al
        WHERE al.tenant_id = lb.tenant_id
          AND trim(COALESCE(al.name, '')) <> ''
          AND (
            al.whatsapp = lb.contact_phone
            OR regexp_replace(al.whatsapp, '^55', '') = regexp_replace(lb.contact_phone, '^55', '')
          )
        LIMIT 1
      )
    ) as establishment_name,
    lb.error_message::text,
    COALESCE(cm.has_response, FALSE) as response_detected,
    (
        CASE 
          WHEN trim(lower(COALESCE(ms.current_status, lb.raw_status::text))) = 'converted' 
               OR (lb.metadata->>'converted') = 'true' 
               OR COALESCE(cm.has_conversion_tag, FALSE) = TRUE THEN TRUE
          WHEN 'CLIENT_RESPONDED' = ANY(lb.success_criteria) THEN COALESCE(cm.has_response, FALSE)
          WHEN 'LINK_SENT' = ANY(lb.success_criteria) AND COALESCE(lb.success_link_filter, '') <> '' THEN 
               COALESCE(cm.has_link_sent_match, FALSE) OR COALESCE(cm.has_conversion_tag, FALSE)
          ELSE FALSE
        END
    ) as is_converted
  FROM leads_base lb
  LEFT JOIN message_statuses ms ON ms.message_id = lb.message_id
  LEFT JOIN conversation_metrics cm ON cm.lead_id = lb.lead_id
  ORDER BY lb.lead_id DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_leads_enriched(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_leads_enriched(uuid, uuid) TO service_role;
