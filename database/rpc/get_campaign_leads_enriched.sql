-- ============================================================
-- RPC: get_campaign_leads_enriched (V2.2 - Fix Noise de Conversas Antigas)
-- Descrição: Retorna leads com status real, filtrando mensagens APÓS o envio da campanha.
-- ============================================================

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
        oq.sent_at, -- Importante para o filtro de tempo
        oq.status as raw_status,
        c.success_criteria,
        c.success_link_filter
      FROM public.outbound_queue oq
      LEFT JOIN public.campaigns c ON c.id = oq.campaign_id
      WHERE oq.tenant_id = p_tenant_id
        AND (p_campaign_id IS NULL OR oq.campaign_id = p_campaign_id)
  ),
  leads_with_status AS (
      SELECT 
        lb.*,
        COALESCE(
          (
            SELECT lower(msh.status)
            FROM public.message_status_history msh
            WHERE msh.message_id = (lb.metadata->>'message_id')::uuid
            ORDER BY msh.created_at DESC
            LIMIT 1
          ),
          lb.raw_status::text
        ) as current_status
      FROM leads_base lb
  )
  SELECT 
    lws.lead_id,
    lws.contact_phone::text,
    lws.contact_name::text,
    lws.current_status as status,
    lws.metadata,
    -- Enriquecimento de CNPJ
    COALESCE(
      (lws.metadata->>'cnpj')::text, 
      (
        SELECT al.identifier::text
        FROM public.agent_leads al 
        WHERE al.tenant_id = lws.tenant_id 
          AND (
            al.whatsapp = lws.contact_phone 
            OR regexp_replace(al.whatsapp, '^55', '') = regexp_replace(lws.contact_phone, '^55', '')
          )
        LIMIT 1
      )
    ) as cnpj,
    -- Enriquecimento de Razão Social
    COALESCE(
      (lws.metadata->>'razao_social')::text,
      (
        SELECT trim(al.name)::text
        FROM public.agent_leads al
        WHERE al.tenant_id = lws.tenant_id
          AND trim(COALESCE(al.name, '')) <> ''
          AND (
            al.whatsapp = lws.contact_phone
            OR regexp_replace(al.whatsapp, '^55', '') = regexp_replace(lws.contact_phone, '^55', '')
          )
        LIMIT 1
      )
    ) as establishment_name,
    lws.error_message::text,
    -- [CORREÇÃO V2.2] response_detected APÓS o envio da campanha
    EXISTS (
        SELECT 1 FROM public.messages m
        WHERE m.conversation_id = lws.conversation_id
          AND m.sender_type = 'user'
          AND m.direction = 'inbound'
          AND (lws.sent_at IS NULL OR m.created_at >= lws.sent_at)
    ) as response_detected,
    -- [CORREÇÃO V2.2] is_converted APÓS o envio da campanha
    (
        CASE 
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
  ORDER BY lws.lead_id DESC;
END;
$$;
