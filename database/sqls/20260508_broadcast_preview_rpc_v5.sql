-- RESOLVENDO AMBIGUIDADE (Usando nomes distintos no RETURNS TABLE e mapeando no Front)
DROP FUNCTION IF EXISTS public.fn_get_broadcast_preview(text, text);

CREATE OR REPLACE FUNCTION public.fn_get_broadcast_preview(
    p_incident_id TEXT,
    p_tenant_id TEXT
)
RETURNS TABLE (
    res_id UUID, 
    res_name TEXT, 
    res_whatsapp TEXT, 
    res_campaign_name TEXT
) AS $$
DECLARE
    v_target_campaign_id UUID;
    v_incident_exists BOOLEAN := FALSE;
BEGIN
    -- 1. Busca a campanha do incidente primeiro
    SELECT campaign_id, TRUE INTO v_target_campaign_id, v_incident_exists
    FROM public.system_incidents 
    WHERE id = p_incident_id::UUID AND tenant_id = p_tenant_id::UUID;

    IF v_incident_exists IS NOT TRUE THEN RETURN; END IF;

    -- 2. Query usando nomes prefixados para evitar qualquer ambiguidade com colunas da tabela
    RETURN QUERY
    SELECT 
        l.id, 
        COALESCE(l.name, '')::TEXT, 
        COALESCE(l.whatsapp, '')::TEXT, 
        COALESCE(c.name, 'Global')::TEXT
    FROM public.agent_leads l
    LEFT JOIN public.campaigns c ON c.id = l.campaign_id
    WHERE l.tenant_id = p_tenant_id::UUID 
      AND l.whatsapp IS NOT NULL
      AND (v_target_campaign_id IS NULL OR l.campaign_id = v_target_campaign_id)
      AND NOT EXISTS (
          SELECT 1 FROM public.messages m
          WHERE m.tenant_id = p_tenant_id::UUID 
            AND m.metadata->>'incident_id' = p_incident_id
            AND (m.metadata->>'phone' = l.whatsapp OR m.sender_name = l.name)
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
