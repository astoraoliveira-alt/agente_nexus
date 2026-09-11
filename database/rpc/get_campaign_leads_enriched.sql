-- ============================================================
-- RPC: get_campaign_leads_enriched (V2.4 - Alinhamento Estrito com get_all_campaigns_metrics_v2)
-- Descrição: Retorna leads com status idêntico ao dashboard para garantir consistência.
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
        COALESCE(oq.response_detected, false) as response_detected,
        c.success_criteria,
        c.success_link_filter
      FROM public.outbound_queue oq
      LEFT JOIN public.campaigns c ON c.id = oq.campaign_id
      WHERE oq.tenant_id = p_tenant_id
        AND (p_campaign_id IS NULL OR oq.campaign_id = p_campaign_id)
  )
  SELECT 
    lb.lead_id,
    lb.contact_phone::text,
    lb.contact_name::text,
    lb.raw_status::text as status,
    lb.metadata,
    -- Enriquecimento de CNPJ
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
    -- Enriquecimento de Razão Social
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
    -- Mesma lógica do get_all_campaigns_metrics_v2
    lb.response_detected as response_detected,
    -- Mesma lógica do get_all_campaigns_metrics_v2
    (
        trim(lower(lb.raw_status)) = 'converted' OR (lb.metadata->>'converted') = 'true'
    ) as is_converted
  FROM leads_base lb
  ORDER BY lb.lead_id DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_leads_enriched(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_leads_enriched(uuid, uuid) TO service_role;
