-- Migration: Update get_next_leads_secure to support Re-engagement V62.0
-- Author: Antigravity AI
-- Date: 2026-05-02

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
    template_id text
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
    -- [A] AUTO-RECUPERAÇÃO: Limpa leads presos no "processing" por erro antigo no n8n (> 30 mins)
    UPDATE public.outbound_queue oq_recover
    SET status = 'pending'
    WHERE oq_recover.tenant_id = p_tenant_id
      AND oq_recover.campaign_id = p_campaign_id
      AND oq_recover.status = 'processing'
      AND oq_recover.created_at < NOW() - INTERVAL '30 minutes';

    -- 1. Buscar configurações da campanha e verificar se está no horário/data
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

    -- 2. Calcular limite diário (Consome saldo para mensagens iniciais e reengajamentos)
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

    -- 3. Buscar e TRAVAR os leads (Fila Normal + Reengajamento)
    RETURN QUERY
    WITH selected_leads AS (
        UPDATE public.outbound_queue q
        SET 
            status = 'processing',
            -- Incrementamos o contador de tentativas se for reengajamento (status anterior não era pending)
            reengagement_attempt_count = CASE 
                WHEN q.status != 'pending' THEN q.reengagement_attempt_count + 1 
                ELSE q.reengagement_attempt_count 
            END,
            reengagement_last_sent_at = CASE 
                WHEN q.status != 'pending' THEN NOW() 
                ELSE q.reengagement_last_sent_at 
            END
        WHERE q.id IN (
            SELECT oq.id 
            FROM public.outbound_queue oq
            JOIN public.campaigns camp ON camp.id = oq.campaign_id
            WHERE oq.tenant_id = p_tenant_id
              AND oq.campaign_id = p_campaign_id
              AND (
                  -- CASO A: Lead novo (pendente)
                  oq.status = 'pending'
                  OR 
                  -- CASO B: Reengajamento Estratégico
                  (
                      camp.reengagement_enabled = true
                      AND oq.status IN ('sent', 'delivered', 'read')
                      AND oq.response_detected = false
                      AND oq.reengagement_attempt_count < camp.reengagement_max_attempts
                      AND NOW() >= (
                          COALESCE((oq.metadata->>'read_at')::timestamptz, oq.sent_at) 
                          + (camp.reengagement_wait_hours * INTERVAL '1 hour')
                      )
                  )
              )
              -- Trava de segurança (2 horas entre mensagens ou 5 mins se preso no processamento)
              AND NOT EXISTS (
                  SELECT 1 FROM public.outbound_queue oq_check
                  WHERE oq_check.tenant_id = p_tenant_id
                    AND oq_check.contact_phone = oq.contact_phone
                    AND (oq_check.status = 'sent' OR oq_check.status = 'processing')
                    AND (oq_check.id <> oq.id)
                    AND (
                        oq_check.sent_at > (NOW() - INTERVAL '2 hours') 
                        OR (oq_check.status = 'processing' AND oq_check.created_at > NOW() - INTERVAL '5 minutes')
                    )
              )
            ORDER BY (oq.status = 'pending') DESC, oq.created_at ASC
            LIMIT v_actual_limit
            FOR UPDATE SKIP LOCKED 
        )
        RETURNING q.id, q.contact_phone, q.contact_name, q.campaign_id, q.agent_id, q.tenant_id, q.reengagement_attempt_count
    )
    SELECT 
        sl.id,
        sl.contact_phone::text as phone,
        sl.contact_name::text,
        sl.campaign_id,
        sl.agent_id,
        sl.tenant_id,
        -- Lógica de Mensagem: Se reengagement_attempt_count > 0 na RETURNING, é reengajamento
        CASE 
            WHEN sl.reengagement_attempt_count > 0 THEN COALESCE(c.reengagement_message, c.initial_message)
            ELSE c.initial_message 
        END::text as message,
        COALESCE(ag.whatsapp_provider, 'evolution')::text as provider,
        ag.evolution_instance::text as instance,
        ag.evolution_token::text as evolution_token,
        ag.meta_api_token::text as meta_api_token,
        ag.meta_phone_number_id::text as meta_phone_number_id,
        ag.zenvia_api_token::text as zenvia_api_token,
        ag.zenvia_channel_id::text as zenvia_channel_id,
        (c.metadata->>'template_id')::text as template_id
    FROM selected_leads sl
    JOIN public.campaigns c ON c.id = sl.campaign_id
    JOIN public.agents ag ON ag.id = sl.agent_id;
END;
$$;
