-- ======================================================== --
-- DAVOS NEXUS - SECURE LEAD FETCH (V50.16)               --
-- Protege contra disparos duplicados e flood de contatos  --
-- ======================================================== --

CREATE OR REPLACE FUNCTION public.get_next_leads_secure(
    p_tenant_id uuid,
    p_campaign_id uuid,
    p_limit int
)
RETURNS TABLE (
    id uuid,
    contact_phone text,
    contact_name text,
    campaign_id uuid,
    agent_id uuid,
    tenant_id uuid,
    initial_message text,
    evolution_instance text
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH available_leads AS (
        -- [1] Busca leads pendentes desta campanha
        SELECT 
            oq.id as oq_id,
            oq.contact_phone,
            oq.contact_name,
            oq.campaign_id as c_id,
            oq.agent_id as a_id,
            oq.tenant_id as t_id
        FROM public.outbound_queue oq
        WHERE oq.tenant_id = p_tenant_id
          AND oq.campaign_id = p_campaign_id
          AND oq.status = 'pending'
    )
    SELECT 
        al.oq_id,
        al.contact_phone,
        al.contact_name,
        al.c_id,
        al.a_id,
        al.t_id,
        camp.initial_message,
        ag.evolution_instance
    FROM available_leads al
    JOIN public.campaigns camp ON camp.id = al.c_id
    JOIN public.agents ag ON ag.id = al.a_id
    WHERE 
        -- [2] FILTRO ANTI-FLOOD:
        -- Garante que o contato NÃO tenha uma conversa ativa nesse momento
        NOT EXISTS (
            SELECT 1 FROM public.conversations conv
            WHERE conv.tenant_id = al.t_id
              AND conv.user_identifier ~ regexp_replace(al.contact_phone, '\D', '', 'g') -- Match parcial de número
              AND conv.status = 'ai_active'
        )
        -- [3] FILTRO DE FREQUÊNCIA:
        -- Garante que não enviamos mensagens pra ele nas últimas 12 horas (mesmo que a conversa tenha fechado)
        AND NOT EXISTS (
            SELECT 1 FROM public.outbound_queue oq_history
            WHERE oq_history.tenant_id = al.t_id
              AND oq_history.contact_phone = al.contact_phone
              AND oq_history.status = 'sent'
              AND oq_history.sent_at > NOW() - INTERVAL '12 hours'
        )
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_leads_secure(uuid, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_leads_secure(uuid, uuid, int) TO service_role;
