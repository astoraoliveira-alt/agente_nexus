-- ============================================================
-- MIGRATION: Add export fields to get_campaign_leads_enriched
-- Desc: Add sent_at and clicked_button for the Excel export
-- ============================================================

DROP FUNCTION IF EXISTS public.get_campaign_leads_enriched(uuid, uuid);

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
  is_converted BOOLEAN,
  sent_at TIMESTAMPTZ,
  clicked_button BOOLEAN
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
    COALESCE(cs.current_status, lb.raw_status::text) as status,
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
          WHEN trim(lower(COALESCE(cs.current_status, lb.raw_status::text))) = 'converted' 
               OR (lb.metadata->>'converted') = 'true' 
               OR COALESCE(cm.has_conversion_tag, FALSE) = TRUE THEN TRUE
          WHEN 'CLIENT_RESPONDED' = ANY(lb.success_criteria) THEN COALESCE(cm.has_response, FALSE)
          WHEN 'LINK_SENT' = ANY(lb.success_criteria) AND COALESCE(lb.success_link_filter, '') <> '' THEN 
               COALESCE(cm.has_link_sent_match, FALSE) OR COALESCE(cm.has_conversion_tag, FALSE)
          ELSE FALSE
        END
    ) as is_converted,
    lb.sent_at,
    (COALESCE(cm.has_button_conversion_tag, FALSE) = TRUE AND (cm.first_user_message_at IS NULL OR cm.first_user_message_at >= cm.first_button_click_at)) as clicked_button
  FROM leads_base lb
  LEFT JOIN conversation_statuses cs ON cs.conversation_id = lb.conversation_id
  LEFT JOIN conversation_metrics cm ON cm.lead_id = lb.lead_id
  ORDER BY lb.lead_id DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_leads_enriched(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_leads_enriched(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
