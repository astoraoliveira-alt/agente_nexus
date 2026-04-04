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
    WITH selected_leads AS (
        -- [1] Busca e TRAVA os leads imediatamente (Atomic Lock)
        UPDATE public.outbound_queue
        SET status = 'processing'
        WHERE id IN (
            SELECT oq.id 
            FROM public.outbound_queue oq
            WHERE oq.tenant_id = p_tenant_id
              AND oq.campaign_id = p_campaign_id
              AND oq.status = 'pending'
              -- Garante que o contato NÃO recebeu nada nas últimas 2h por outra campanha
              AND NOT EXISTS (
                  SELECT 1 FROM public.outbound_queue oq_check
                  WHERE oq_check.tenant_id = p_tenant_id
                    AND oq_check.contact_phone = oq.contact_phone
                    AND (oq_check.status = 'sent' OR oq_check.status = 'processing')
                    AND (oq_check.id <> oq.id)
                    AND (oq_check.sent_at > (NOW() - INTERVAL '2 hours') OR (oq_check.status = 'processing' AND oq_check.created_at > NOW() - INTERVAL '5 minutes'))
              )
            LIMIT p_limit
            FOR UPDATE SKIP LOCKED -- Pula os que já estão travados por outro processo
        )
        RETURNING public.outbound_queue.id, public.outbound_queue.contact_phone, public.outbound_queue.contact_name, public.outbound_queue.campaign_id, public.outbound_queue.agent_id, public.outbound_queue.tenant_id
    )
    SELECT 
        sl.id,
        sl.contact_phone,
        sl.contact_name,
        sl.campaign_id,
        sl.agent_id,
        sl.tenant_id,
        camp.initial_message,
        ag.evolution_instance
    FROM selected_leads sl
    JOIN public.campaigns camp ON camp.id = sl.campaign_id
    JOIN public.agents ag ON ag.id = sl.agent_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_leads_secure(uuid, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_leads_secure(uuid, uuid, int) TO service_role;
