-- ======================================================== --
-- DAVOS NEXUS - SECURE LEAD FETCH (V50.21)               --
-- Mantendo Colunas Originais + Correção de Timezone + Agendamento --
-- ======================================================== --

-- 🔴 CRITICAL: Drop existing function to change return type signature
DROP FUNCTION IF EXISTS public.get_next_leads_secure(uuid, uuid, int);

CREATE OR REPLACE FUNCTION public.get_next_leads_secure(
    p_tenant_id uuid,
    p_campaign_id uuid,
    p_limit int
)
RETURNS TABLE (
    id uuid,
    phone text,
    contact_name text,
    campaign_id uuid,
    agent_id uuid,
    tenant_id uuid,
    message text,
    provider text,
    instance text,
    evolution_token text,
    meta_api_token text,
    meta_phone_number_id text,
    zenvia_api_token text,
    zenvia_channel_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_daily_limit int;
    v_allowed_now boolean;
    v_campaign_agent_id uuid;
BEGIN
    -- 1. Check Campaign Window (Timezone America/Sao_Paulo)
    SELECT 
        agent_id,
        daily_limit,
        (
            (CURRENT_TIME AT TIME ZONE 'America/Sao_Paulo')::time >= start_time::time AND 
            (CURRENT_TIME AT TIME ZONE 'America/Sao_Paulo')::time <= end_time::time
        ) INTO v_campaign_agent_id, v_daily_limit, v_allowed_now
    FROM public.campaigns
    WHERE id = p_campaign_id AND status = 'active';

    IF NOT v_allowed_now THEN
        RETURN;
    END IF;

    -- 2. Fetch and Lock Leads
    RETURN QUERY
    WITH selected_leads AS (
        UPDATE public.outbound_queue
        SET 
            status = 'assigned',
            last_attempt_at = NOW()
        WHERE id IN (
            SELECT q.id
            FROM public.outbound_queue q
            WHERE q.campaign_id = p_campaign_id
              AND q.status = 'pending'
              AND (q.scheduled_at IS NULL OR q.scheduled_at <= NOW())
            ORDER BY q.created_at ASC
            LIMIT p_limit
            FOR UPDATE SKIP LOCKED
        )
        RETURNING *
    )
    SELECT 
        sl.id,
        sl.contact_phone::text as phone,
        sl.contact_name::text,
        sl.campaign_id,
        sl.agent_id,
        sl.tenant_id,
        camp.initial_message::text as message,
        COALESCE(ag.whatsapp_provider, 'evolution')::text as provider,
        ag.evolution_instance::text as instance,
        ag.evolution_token::text as evolution_token,
        ag.meta_api_token::text as meta_api_token,
        ag.meta_phone_number_id::text as meta_phone_number_id,
        ag.zenvia_api_token::text as zenvia_api_token,
        ag.zenvia_channel_id::text as zenvia_channel_id
    FROM selected_leads sl
    JOIN public.campaigns camp ON camp.id = sl.campaign_id
    JOIN public.agents ag ON ag.id = sl.agent_id;
END;
$$;
