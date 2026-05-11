-- FUNÇÃO PARA PRÉ-VISUALIZAÇÃO DE BROADCAST
-- Permite que o usuário veja e filtre quem vai receber o alerta antes de disparar

CREATE OR REPLACE FUNCTION public.fn_get_broadcast_preview(
    p_incident_id UUID,
    p_tenant_id UUID
)
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    whatsapp VARCHAR,
    campaign_name VARCHAR
) AS $$
DECLARE
    v_incident RECORD;
BEGIN
    -- 1. Busca os dados do incidente
    SELECT * INTO v_incident 
    FROM public.system_incidents 
    WHERE id = p_incident_id AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- 2. Retorna a lista de leads qualificados que ainda não receberam este incidente
    RETURN QUERY
    SELECT 
        l.id,
        l.name,
        l.whatsapp,
        (SELECT c.name FROM public.campaigns c WHERE c.id = l.campaign_id) as campaign_name
    FROM public.agent_leads l
    WHERE l.tenant_id = p_tenant_id
      AND l.whatsapp IS NOT NULL
      -- Filtro de Campanha do Incidente
      AND (v_incident.campaign_id IS NULL OR l.campaign_id = v_incident.campaign_id)
      -- Deduplicação: Não mostra se já recebeu
      AND NOT EXISTS (
          SELECT 1 FROM public.messages m
          WHERE m.tenant_id = p_tenant_id 
            AND m.metadata->>'incident_id' = p_incident_id::TEXT
            AND (m.metadata->>'phone' = l.whatsapp OR m.sender_name = l.name)
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
