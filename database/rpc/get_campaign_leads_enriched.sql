-- ============================================================
-- RPC: get_campaign_leads_enriched
-- Descrição: Retorna a lista de leads de uma campanha com enriquecimento de identificador (CNPJ/CPF)
-- ============================================================

DROP FUNCTION IF EXISTS get_campaign_leads_enriched(uuid,uuid);

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
  error_message TEXT
) 
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    oq.id,
    oq.contact_phone::text,
    oq.contact_name::text,
    COALESCE(
      (
        SELECT lower(msh.status)
        FROM public.message_status_history msh
        WHERE msh.message_id = (oq.metadata->>'message_id')::uuid
        ORDER BY msh.created_at DESC
        LIMIT 1
      ),
      oq.status::text
    ) as status,
    oq.metadata,
    COALESCE(
      (oq.metadata->>'cnpj')::text, 
      (
        SELECT al.identifier::text
        FROM public.agent_leads al 
        WHERE al.tenant_id = oq.tenant_id 
          AND (
            -- Tenta match exato ou match flexível (removendo 55 se houver inconsistência)
            al.whatsapp = oq.contact_phone 
            OR 
            regexp_replace(al.whatsapp, '^55', '') = regexp_replace(oq.contact_phone, '^55', '')
          )
        LIMIT 1
      )
    ) as cnpj,
    (
      SELECT trim(al.name)::text
      FROM public.agent_leads al
      WHERE al.tenant_id = oq.tenant_id
        AND trim(COALESCE(al.name, '')) <> ''
        AND (
          al.whatsapp = oq.contact_phone
          OR regexp_replace(al.whatsapp, '^55', '') = regexp_replace(oq.contact_phone, '^55', '')
          OR al.identifier = COALESCE(
            (oq.metadata->>'cnpj')::text,
            (
              SELECT al2.identifier::text
              FROM public.agent_leads al2
              WHERE al2.tenant_id = oq.tenant_id
                AND (
                  al2.whatsapp = oq.contact_phone
                  OR regexp_replace(al2.whatsapp, '^55', '') = regexp_replace(oq.contact_phone, '^55', '')
                )
              LIMIT 1
            )
          )
        )
      LIMIT 1
    ) as establishment_name,
    oq.error_message::text
  FROM public.outbound_queue oq
  WHERE oq.tenant_id = p_tenant_id
    AND (p_campaign_id IS NULL OR oq.campaign_id = p_campaign_id)
  ORDER BY oq.created_at DESC;
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION get_campaign_leads_enriched(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_campaign_leads_enriched(UUID, UUID) TO service_role;
