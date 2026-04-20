-- ======================================================== --
-- DAVOS NEXUS - SECURE LEAD FETCH (V50.20 - Multi-Provider) --
-- Refatorado para compatibilidade com UTIL - Send WhatsApp   --
-- ======================================================== --

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
    v_sent_today int;
    v_actual_limit int;
BEGIN
    -- 0. Auto-Recuperação: Limpa as mensagens presas que falharam no n8n (> 30 mins)
    -- Ajustado para olhar last_attempt_at em vez de created_at
    UPDATE public.outbound_queue oq_recover
    SET status = 'pending'
    WHERE oq_recover.tenant_id = p_tenant_id
      AND oq_recover.campaign_id = p_campaign_id
      AND oq_recover.status = 'processing'
      AND oq_recover.last_attempt_at < (NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '30 minutes';

    -- 1. Buscar configurações da campanha e janela de horário
    SELECT 
        camp.daily_limit,
        (
            (NOW() AT TIME ZONE 'America/Sao_Paulo')::date >= COALESCE(camp.start_date, '2000-01-01'::date) AND 
            (NOW() AT TIME ZONE 'America/Sao_Paulo')::date <= COALESCE(camp.end_date, '2099-12-31'::date) AND
            (NOW() AT TIME ZONE 'America/Sao_Paulo')::time >= COALESCE(camp.start_time, '00:00:00')::time AND 
            (NOW() AT TIME ZONE 'America/Sao_Paulo')::time <= COALESCE(camp.end_time, '23:59:59')::time
        ) as in_window
    INTO v_daily_limit, v_allowed_now
    FROM public.campaigns camp
    WHERE camp.id = p_campaign_id AND camp.status = 'active';

    -- Se fora da janela, encerra
    IF NOT v_allowed_now OR v_allowed_now IS NULL THEN
        RETURN;
    END IF;

    -- 2. Calcular Quota Diária Restante (Limite - Enviados Hoje)
    SELECT COUNT(*)::int INTO v_sent_today
    FROM public.consumption_metrics cm
    WHERE cm.tenant_id = p_tenant_id
      AND cm.metric_type = 'messages'
      AND cm.metadata->>'campaign_id' = p_campaign_id::text
      AND (cm.recorded_at AT TIME ZONE 'America/Sao_Paulo')::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date;

    v_actual_limit := LEAST(p_limit, GREATEST(0, COALESCE(v_daily_limit, 999999) - v_sent_today));

    IF v_actual_limit <= 0 THEN
        RETURN;
    END IF;

    -- 3. Buscar, TRAVAR e RETORNAR os leads enriquecidos
    RETURN QUERY
    WITH selected_leads AS (
        UPDATE public.outbound_queue oq_update
        SET status = 'processing',
            last_attempt_at = NOW() -- IMPORTANTE: Marcar quando começou o processo
        WHERE oq_update.id IN (
            SELECT oq.id 
            FROM public.outbound_queue oq
            WHERE oq.tenant_id = p_tenant_id
              AND oq.campaign_id = p_campaign_id
              AND oq.status = 'pending'
              -- Anti-Flood: 2 horas de respiro para o mesmo contato (DESATIVADO PARA TESTES)
              /*
              AND NOT EXISTS (
                  SELECT 1 FROM public.outbound_queue oq_check
                  WHERE oq_check.tenant_id = p_tenant_id
                    AND oq_check.contact_phone = oq.contact_phone
                    AND (oq_check.status = 'sent' OR oq_check.status = 'processing')
                    AND (oq_check.id <> oq.id)
                    AND (oq_check.sent_at > (NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '2 hours' OR (oq_check.status = 'processing' AND oq_check.last_attempt_at > (NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '30 minutes'))
              )
              */
            ORDER BY oq.created_at ASC
            LIMIT v_actual_limit
            FOR UPDATE SKIP LOCKED 
        )
        RETURNING oq_update.id, oq_update.contact_phone, oq_update.contact_name, oq_update.campaign_id, oq_update.agent_id, oq_update.tenant_id
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

GRANT EXECUTE ON FUNCTION public.get_next_leads_secure(uuid, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_leads_secure(uuid, uuid, int) TO service_role;
