-- ==========================================================
-- Migration: Fix boolean logic in get_next_leads_secure
-- Date: 2026-05-27
-- Description: Corrects the three-valued logic bug by adding COALESCE to the metadata->>'converted' check.
-- ==========================================================

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
    zenvia_image_url text,
    cta_link text,
    campaign_metadata jsonb,
    lead_metadata jsonb
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
    v_capping JSONB;
BEGIN
    -- [A] AUTO-RECUPERAÇÃO: Limpa leads presos no "processing" (> 30 mins)
    UPDATE public.outbound_queue oq_recover
    SET status = 'pending'
    WHERE oq_recover.tenant_id = p_tenant_id
      AND oq_recover.campaign_id = p_campaign_id
      AND oq_recover.status = 'processing'
      AND oq_recover.created_at < NOW() - INTERVAL '30 minutes';

    -- 1. Buscar configurações e verificar janela
    SELECT 
        camp.daily_limit,
        camp.capping_config,
        (
            CURRENT_DATE >= COALESCE(camp.start_date, '2000-01-01'::date) AND 
            CURRENT_DATE <= COALESCE(camp.end_date, '2099-12-31'::date) AND
            (CURRENT_TIME AT TIME ZONE 'America/Sao_Paulo')::time >= COALESCE(camp.start_time::text, '00:00:00')::time AND 
            (CURRENT_TIME AT TIME ZONE 'America/Sao_Paulo')::time <= COALESCE(camp.end_time::text, '23:59:59')::time
        )
    INTO v_daily_limit, v_capping, v_allowed_now
    FROM public.campaigns camp
    WHERE camp.id = p_campaign_id AND camp.status = 'active';

    IF NOT v_allowed_now OR v_allowed_now IS NULL THEN
        RETURN;
    END IF;

    -- 2. Calcular limite diário restante
    SELECT COUNT(*)::int INTO v_sent_today
    FROM public.outbound_queue oq_sent
    WHERE oq_sent.campaign_id = p_campaign_id 
      AND oq_sent.status IN ('sent', 'delivered', 'read') 
      AND oq_sent.sent_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::DATE 
      AND oq_sent.sent_at < ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::DATE + INTERVAL '1 day');

    v_actual_limit := LEAST(p_limit, GREATEST(0, v_daily_limit - v_sent_today));

    IF v_actual_limit <= 0 THEN
        RETURN;
    END IF;

    -- 3. Buscar e TRAVAR os leads (Com Filtro de Frequency Capping e Exclusão de Convertidos)
    RETURN QUERY
    WITH selected_leads AS (
        UPDATE public.outbound_queue q
        SET 
            status = 'processing',
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
                  oq.status = 'pending'
                  OR 
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
              -- [FREQUÊNCIA CAPPING HIERÁRQUICO]
              AND (
                  (v_capping->>'override_for_incidents')::boolean = true -- Emergência ignora capping
                  OR
                  NOT EXISTS (
                      SELECT 1 FROM public.contact_pressure_logs cpl
                      WHERE cpl.tenant_id = p_tenant_id
                        AND cpl.contact_phone = oq.contact_phone
                        AND cpl.sent_at > NOW() - (COALESCE(v_capping->>'cooldown_hours', '24')::int || ' hours')::interval
                  )
              )
              -- [EXCLUSÃO DE LEADS JÁ CONVERTIDOS]
              AND NOT (
                  trim(lower(oq.status)) = 'converted' 
                  OR COALESCE(oq.metadata->>'converted', 'false') = 'true' 
                  OR EXISTS (
                      SELECT 1 FROM public.messages m
                      WHERE m.conversation_id = oq.conversation_id
                        AND (m.content ILIKE '%[CONVERSÃO]%' OR m.content ILIKE '%✅ [CONVERSÃO]%')
                        AND (oq.sent_at IS NULL OR m.created_at >= oq.sent_at)
                  )
                  OR (
                      'CLIENT_RESPONDED' = ANY(camp.success_criteria)
                      AND EXISTS (
                          SELECT 1 FROM public.messages m
                          WHERE m.conversation_id = oq.conversation_id
                            AND m.sender_type = 'user'
                            AND m.direction = 'inbound'
                            AND (oq.sent_at IS NULL OR m.created_at >= oq.sent_at)
                      )
                  )
                  OR (
                      'LINK_SENT' = ANY(camp.success_criteria)
                      AND COALESCE(camp.success_link_filter, '') <> ''
                      AND EXISTS (
                          SELECT 1 FROM public.messages m
                          WHERE m.conversation_id = oq.conversation_id
                            AND (
                              (m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system') AND m.content ILIKE '%' || camp.success_link_filter || '%')
                              OR m.content ILIKE '%✅ [CONVERSÃO]%'
                              OR m.content ILIKE '%[CONVERSÃO]%'
                            )
                            AND (oq.sent_at IS NULL OR m.created_at >= oq.sent_at)
                      )
                  )
              )
              -- [ANTI-COLISÃO ORIGINAL]
              AND NOT EXISTS (
                  SELECT 1 FROM public.outbound_queue oq_check
                  WHERE oq_check.tenant_id = p_tenant_id
                    AND oq_check.contact_phone = oq.contact_phone
                    AND oq_check.status = 'processing'
                    AND oq_check.id <> oq.id
                    AND oq_check.created_at > (NOW() - INTERVAL '5 minutes')
              )
            ORDER BY (oq.status = 'pending') DESC, oq.created_at ASC
            LIMIT v_actual_limit
            FOR UPDATE SKIP LOCKED 
        )
        RETURNING q.*
    ),
    -- Registra a pressão de contato para os leads selecionados usando aliases para evitar ambiguidade
    log_pressure AS (
        INSERT INTO public.contact_pressure_logs (tenant_id, contact_phone, campaign_id)
        SELECT sl.tenant_id, sl.contact_phone, sl.campaign_id FROM selected_leads sl
    )
    SELECT 
        sl.id,
        sl.contact_phone::text as phone,
        sl.contact_name::text,
        sl.campaign_id,
        sl.agent_id,
        sl.tenant_id,
        CASE 
            WHEN sl.reengagement_attempt_count > 0 THEN COALESCE(c.reengagement_message, c.initial_message)
            ELSE COALESCE(sl.metadata->>'content', c.initial_message)
        END::text as message,
        COALESCE(ag.whatsapp_provider, 'evolution')::text as provider,
        ag.evolution_instance::text as instance,
        ag.evolution_token::text as evolution_token,
        ag.meta_api_token::text as meta_api_token,
        ag.meta_phone_number_id::text as meta_phone_number_id,
        ag.zenvia_api_token::text as zenvia_api_token,
        ag.zenvia_channel_id::text as zenvia_channel_id,
        -- LÓGICA DE TEMPLATE: Se for reengajamento, usa o template específico; caso contrário, cai de volta no template da campanha original.
        CASE 
            WHEN sl.reengagement_attempt_count > 0 THEN COALESCE(c.reengagement_template_id, (c.metadata->>'template_id')::text, '')
            ELSE COALESCE((c.metadata->>'template_id')::text, '')
        END::text as template_id,
        COALESCE(c.metadata->>'zenvia_image_url', '')::text as zenvia_image_url,
        COALESCE(sl.metadata->>'cta_link', c.metadata->>'zenvia_cta_link', '')::text as cta_link,
        c.metadata as campaign_metadata,
        sl.metadata as lead_metadata
    FROM selected_leads sl
    JOIN public.campaigns c ON c.id = sl.campaign_id
    JOIN public.agents ag ON ag.id = sl.agent_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_leads_secure(uuid, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_leads_secure(uuid, uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_next_leads_secure(uuid, uuid, int) TO anon;
