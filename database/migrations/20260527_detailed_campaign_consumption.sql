-- ==========================================================
-- Migration: Detailed Campaign Consumption & Date Filters
-- Date: 2026-05-27
-- Description: Overloads get_detailed_consumption to support date range filters and return campaign_id/reengagement_attempt. Updates messages trigger to capture campaign context in billing windows.
-- ==========================================================

BEGIN;

-- 1. DROP THE OLD FUNCTION SIGNATURE TO PREVENT CONFLICTS
DROP FUNCTION IF EXISTS public.get_detailed_consumption(UUID, INT);

-- 2. CREATE NEW OVERLOADED DETAILED CONSUMPTION FUNCTION
CREATE OR REPLACE FUNCTION public.get_detailed_consumption(
    p_tenant_id UUID,
    p_days INT DEFAULT 30,
    p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    agent_id UUID,
    agent_name VARCHAR,
    channel VARCHAR,
    metric_type VARCHAR,
    value NUMERIC,
    cost NUMERIC,
    recorded_at TIMESTAMP WITH TIME ZONE,
    campaign_id UUID,
    reengagement_attempt INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
    DECLARE
        v_msg_price NUMERIC;
    BEGIN
        -- Get the current message price for this tenant (from company override or plan default)
        SELECT COALESCE((c.plan_prices->>'message_flat')::NUMERIC, p.message_price, 0)
        INTO v_msg_price
        FROM companies c
        LEFT JOIN plans p ON c.plan_tier = p.id
        WHERE c.id = p_tenant_id;

        RETURN QUERY
        -- 1. Real billable metrics (Tokens, STT, TTS) aggregated by hour
        SELECT 
            NULL::UUID as id,
            cm.agent_id,
            a.name as agent_name,
            cm.channel::VARCHAR,
            cm.metric_type::VARCHAR,
            SUM(cm.value)::NUMERIC as value,
            SUM(cm.cost)::NUMERIC as cost,
            date_trunc('hour', cm.recorded_at) as recorded_at,
            (cm.metadata->>'campaign_id')::uuid as campaign_id,
            COALESCE((cm.metadata->>'reengagement_attempt_count')::integer, 0) as reengagement_attempt
        FROM consumption_metrics cm
        LEFT JOIN agents a ON cm.agent_id = a.id
        WHERE cm.tenant_id = p_tenant_id
          AND (
            (p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND cm.recorded_at >= p_start_date AND cm.recorded_at <= p_end_date)
            OR
            (p_start_date IS NULL AND cm.recorded_at >= NOW() - (p_days || ' days')::INTERVAL)
          )
          AND cm.metric_type != 'messages'
        GROUP BY cm.agent_id, a.name, cm.channel, cm.metric_type, date_trunc('hour', cm.recorded_at), (cm.metadata->>'campaign_id'), (cm.metadata->>'reengagement_attempt_count')

        UNION ALL

        -- 2. Synthetic metrics from messages table (Dynamic calculation based on current plan) aggregated by hour
        SELECT 
            NULL::UUID as id,
            conv.agent_id,
            COALESCE(a.name, 'Agente')::VARCHAR as agent_name,
            COALESCE(conv.channel::VARCHAR, 'whatsapp')::VARCHAR as channel,
            'messages'::VARCHAR as metric_type,
            COUNT(*)::NUMERIC as value,
            (COUNT(*) * v_msg_price)::NUMERIC as cost,
            date_trunc('hour', m.created_at) as recorded_at,
            conv.campaign_id as campaign_id,
            0::integer as reengagement_attempt
        FROM messages m
        LEFT JOIN conversations conv ON m.conversation_id = conv.id
        LEFT JOIN agents a ON conv.agent_id = a.id
        WHERE m.tenant_id = p_tenant_id
          AND (
            (p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND m.created_at >= p_start_date AND m.created_at <= p_end_date)
            OR
            (p_start_date IS NULL AND m.created_at >= NOW() - (p_days || ' days')::INTERVAL)
          )
          -- Do NOT count messages as units if the conversation/tenant uses 24h window billing
          AND NOT (
            COALESCE(conv.channel, 'whatsapp')::text = 'whatsapp'
            AND (
                COALESCE(conv.metadata->>'whatsapp_billing_mode', '') = 'window_24h'
                OR
                EXISTS (
                    SELECT 1 
                    FROM companies c 
                    JOIN plans p ON c.plan_tier = p.id
                    WHERE c.id = p_tenant_id 
                    AND (
                        c.plan_prices->>'whatsappOfficialBillingMode' = 'window_24h' 
                        OR c.plan_prices->>'whatsapp_official_billing_mode' = 'window_24h'
                        OR p.whatsapp_official_billing_mode = 'window_24h'
                    )
                )
            )
          )
        GROUP BY conv.agent_id, a.name, conv.channel, date_trunc('hour', m.created_at), conv.campaign_id
        
        UNION ALL

        -- 3. WhatsApp Official Windows (24h) aggregated by hour
        SELECT 
            NULL::UUID as id,
            w.agent_id,
            COALESCE(a.name, 'Agente')::VARCHAR as agent_name,
            'whatsapp'::VARCHAR as channel,
            'messages'::VARCHAR as metric_type,
            COUNT(*)::NUMERIC as value,
            (COUNT(*) * v_msg_price)::NUMERIC as cost, -- Using the plan price (1.10)
            date_trunc('hour', w.window_started_at) as recorded_at,
            (w.metadata->>'campaign_id')::uuid as campaign_id,
            COALESCE((w.metadata->>'reengagement_attempt_count')::integer, 0) as reengagement_attempt
        FROM whatsapp_billing_windows w
        LEFT JOIN agents a ON w.agent_id = a.id
        WHERE w.tenant_id = p_tenant_id
          AND (
            (p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND w.window_started_at >= p_start_date AND w.window_started_at <= p_end_date)
            OR
            (p_start_date IS NULL AND w.window_started_at >= NOW() - (p_days || ' days')::INTERVAL)
          )
        GROUP BY w.agent_id, a.name, date_trunc('hour', w.window_started_at), (w.metadata->>'campaign_id'), (w.metadata->>'reengagement_attempt_count')
        
        ORDER BY recorded_at DESC;
    END;
$$;

-- 3. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION get_detailed_consumption(UUID, INT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_detailed_consumption(UUID, INT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO service_role;

-- 4. UPDATE MESSAGES TRIGGER FUNCTION TO CAPTURE CAMPAIGN INFO
CREATE OR REPLACE FUNCTION public.fn_trg_billing_messages_unified()
RETURNS trigger AS $$
DECLARE
    v_agent_id UUID;
    v_phone TEXT;
    v_campaign_id UUID;
    v_reengagement_attempt_count INT;
BEGIN
    -- Processa apenas mensagens enviadas (outbound)
    IF NEW.direction <> 'outbound' THEN RETURN NEW; END IF;
    
    -- Busca dados da conversa para validar se é Whatsapp
    SELECT agent_id, user_identifier INTO v_agent_id, v_phone
    FROM public.conversations 
    WHERE id = NEW.conversation_id 
      AND channel = 'whatsapp';

    IF v_agent_id IS NOT NULL AND v_phone IS NOT NULL THEN
        -- Tenta encontrar o registro correspondente da fila outbound_queue para recuperar o contexto de campanha e reengajamento
        SELECT campaign_id, reengagement_attempt_count
        INTO v_campaign_id, v_reengagement_attempt_count
        FROM public.outbound_queue
        WHERE conversation_id = NEW.conversation_id
           OR (tenant_id = NEW.tenant_id AND contact_phone = v_phone)
        ORDER BY sent_at DESC NULLS LAST, created_at DESC
        LIMIT 1;

        PERFORM public.fn_process_whatsapp_billing(
            NEW.tenant_id, 
            v_agent_id, 
            NEW.conversation_id, 
            NEW.id, 
            v_phone, 
            NEW.created_at,
            jsonb_build_object(
                'trigger_origin', 'messages_v61',
                'campaign_id', v_campaign_id,
                'reengagement_attempt_count', COALESCE(v_reengagement_attempt_count, 0)
            )
        );
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Silencioso para não travar o fluxo se o billing falhar
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. BACKFILL MAY 2026 METADATA
-- Backfill whatsapp_billing_windows
UPDATE public.whatsapp_billing_windows w
SET metadata = coalesce(w.metadata, '{}'::jsonb) || jsonb_build_object(
    'campaign_id', q.campaign_id,
    'reengagement_attempt_count', COALESCE(q.reengagement_attempt_count, 0)
)
FROM public.outbound_queue q
WHERE w.outbound_queue_id = q.id
  AND w.window_started_at >= '2026-05-01'::timestamptz
  AND (w.metadata->>'campaign_id' IS NULL OR w.metadata->>'reengagement_attempt_count' IS NULL);

-- Backfill consumption_metrics (if they exist)
UPDATE public.consumption_metrics cm
SET metadata = coalesce(cm.metadata, '{}'::jsonb) || jsonb_build_object(
    'campaign_id', w.metadata->>'campaign_id',
    'reengagement_attempt_count', COALESCE((w.metadata->>'reengagement_attempt_count')::int, 0)
)
FROM public.whatsapp_billing_windows w
WHERE (cm.metadata->>'window_id')::uuid = w.id
  AND cm.recorded_at >= '2026-05-01'::timestamptz
  AND (cm.metadata->>'campaign_id' IS NULL OR cm.metadata->>'reengagement_attempt_count' IS NULL);

COMMIT;
