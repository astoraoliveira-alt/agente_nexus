-- 20260514_fix_get_next_leads_add_cta_link.sql
-- Adiciona cta_link personalizado (agent_leads) ao retorno do RPC de produção.
-- O link do lead individual tem prioridade sobre o link genérico da campanha.

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
    zenvia_channel_id text,
    template_id text,
    cta_link text          -- NOVO: link personalizado por lead
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_daily_limit int;
    v_sent_today int;
    v_allowed_now boolean;
    v_actual_limit int;
BEGIN
    -- [A] AUTO-RECUPERAÇÃO: Libera leads presos em "processing" há mais de 30 min
    UPDATE public.outbound_queue oq_recover
    SET status = 'pending'
    WHERE oq_recover.tenant_id = p_tenant_id
      AND oq_recover.campaign_id = p_campaign_id
      AND oq_recover.status = 'processing'
      AND oq_recover.created_at < NOW() - INTERVAL '30 minutes';

    -- [1] Verificar janela de horário e data da campanha
    SELECT 
        camp.daily_limit,
        (
            CURRENT_DATE >= COALESCE(camp.start_date, '2000-01-01'::date) AND 
            CURRENT_DATE <= COALESCE(camp.end_date, '2099-12-31'::date) AND
            (CURRENT_TIME AT TIME ZONE 'UTC-3')::time >= COALESCE(camp.start_time, '00:00:00')::time AND 
            (CURRENT_TIME AT TIME ZONE 'UTC-3')::time <= COALESCE(camp.end_time, '23:59:59')::time
        ) as in_window
    INTO v_daily_limit, v_allowed_now
    FROM public.campaigns camp
    WHERE camp.id = p_campaign_id AND camp.status = 'active';

    IF NOT v_allowed_now OR v_allowed_now IS NULL THEN
        RETURN;
    END IF;

    -- [2] Calcular limite restante do dia
    SELECT COUNT(*)::int INTO v_sent_today
    FROM public.outbound_queue oq_sent
    WHERE oq_sent.campaign_id = p_campaign_id 
      AND oq_sent.status IN ('sent', 'delivered', 'read') 
      AND oq_sent.sent_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC-3')::DATE 
      AND oq_sent.sent_at < ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC-3')::DATE + INTERVAL '1 day');

    v_actual_limit := LEAST(p_limit, GREATEST(0, v_daily_limit - v_sent_today));

    IF v_actual_limit <= 0 THEN
        RETURN;
    END IF;

    -- [3] Buscar, travar e retornar leads com link personalizado
    RETURN QUERY
    WITH selected_leads AS (
        UPDATE public.outbound_queue q
        SET status = 'processing'
        WHERE q.id IN (
            SELECT oq.id 
            FROM public.outbound_queue oq
            WHERE oq.tenant_id = p_tenant_id
              AND oq.campaign_id = p_campaign_id
              AND oq.status = 'pending'
              AND NOT EXISTS (
                  SELECT 1 FROM public.outbound_queue oq_check
                  WHERE oq_check.tenant_id = p_tenant_id
                    AND oq_check.contact_phone = oq.contact_phone
                    AND (oq_check.status = 'sent' OR oq_check.status = 'processing')
                    AND (oq_check.id <> oq.id)
                    AND (oq_check.sent_at > (NOW() - INTERVAL '2 hours') OR (oq_check.status = 'processing' AND oq_check.created_at > NOW() - INTERVAL '5 minutes'))
              )
            ORDER BY oq.created_at ASC
            LIMIT v_actual_limit
            FOR UPDATE SKIP LOCKED 
        )
        RETURNING q.id, q.contact_phone, q.contact_name, q.campaign_id, q.agent_id, q.tenant_id
    )
    SELECT 
        sl.id,
        sl.contact_phone::text                                          AS phone,
        sl.contact_name::text,
        sl.campaign_id,
        sl.agent_id,
        sl.tenant_id,
        c.initial_message::text                                         AS message,
        COALESCE(ag.whatsapp_provider, 'evolution')::text              AS provider,
        ag.evolution_instance::text                                     AS instance,
        ag.evolution_token::text                                        AS evolution_token,
        ag.meta_api_token::text                                         AS meta_api_token,
        ag.meta_phone_number_id::text                                   AS meta_phone_number_id,
        ag.zenvia_api_token::text                                       AS zenvia_api_token,
        ag.zenvia_channel_id::text                                      AS zenvia_channel_id,
        (c.metadata->>'template_id')::text                              AS template_id,
        -- Prioridade: link do agent_lead > link genérico da campanha > vazio
        COALESCE(
            al.cta_link,
            c.metadata->>'zenvia_cta_link',
            ''
        )::text                                                         AS cta_link
    FROM selected_leads sl
    JOIN public.campaigns c   ON c.id  = sl.campaign_id
    JOIN public.agents ag     ON ag.id = sl.agent_id
    -- JOIN com agent_leads pelo telefone + campanha para pegar o link personalizado
    LEFT JOIN public.agent_leads al
           ON al.campaign_id = sl.campaign_id
          AND al.whatsapp    = sl.contact_phone;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_leads_secure(uuid, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_leads_secure(uuid, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_next_leads_secure(uuid, uuid, int) TO anon;
