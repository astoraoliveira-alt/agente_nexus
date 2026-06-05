-- ==========================================================
-- Script Corretivo para Exibição de Consumo de Reengajamento
-- Data: 2026-06-02
-- Descrição: Atualiza a RPC de consumo detalhado para capturar corretamente
--            o reengagement_loop gravado pelo n8n no metadata das mensagens.
-- ==========================================================

BEGIN;

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
            COALESCE((cm.metadata->>'reengagement_attempt_count')::integer, COALESCE((cm.metadata->>'reengagement_loop')::integer, 0)) as reengagement_attempt
        FROM consumption_metrics cm
        LEFT JOIN agents a ON cm.agent_id = a.id
        WHERE cm.tenant_id = p_tenant_id
          AND (
            (p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND cm.recorded_at >= p_start_date AND cm.recorded_at <= p_end_date)
            OR
            (p_start_date IS NULL AND cm.recorded_at >= NOW() - (p_days || ' days')::INTERVAL)
          )
          AND cm.metric_type != 'messages'
        GROUP BY cm.agent_id, a.name, cm.channel, cm.metric_type, date_trunc('hour', cm.recorded_at), (cm.metadata->>'campaign_id'), COALESCE((cm.metadata->>'reengagement_attempt_count')::integer, COALESCE((cm.metadata->>'reengagement_loop')::integer, 0))

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
            -- [CORREÇÃO AQUI]: Busca o reengagement_loop (ou reengagement_attempt_count) em vez de chumbar 0
            COALESCE((m.metadata->>'reengagement_loop')::integer, COALESCE((m.metadata->>'reengagement_attempt_count')::integer, 0)) as reengagement_attempt
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
        GROUP BY conv.agent_id, a.name, conv.channel, date_trunc('hour', m.created_at), conv.campaign_id, COALESCE((m.metadata->>'reengagement_loop')::integer, COALESCE((m.metadata->>'reengagement_attempt_count')::integer, 0))
        
        UNION ALL

        -- 3. WhatsApp Official Windows (24h) aggregated by hour
        SELECT 
            NULL::UUID as id,
            w.agent_id,
            COALESCE(a.name, 'Agente')::VARCHAR as agent_name,
            'whatsapp'::VARCHAR as channel,
            'messages'::VARCHAR as metric_type,
            COUNT(*)::NUMERIC as value,
            (COUNT(*) * v_msg_price)::NUMERIC as cost, -- Using the plan price
            date_trunc('hour', w.window_started_at) as recorded_at,
            (w.metadata->>'campaign_id')::uuid as campaign_id,
            COALESCE((w.metadata->>'reengagement_attempt_count')::integer, COALESCE((w.metadata->>'reengagement_loop')::integer, 0)) as reengagement_attempt
        FROM whatsapp_billing_windows w
        LEFT JOIN agents a ON w.agent_id = a.id
        WHERE w.tenant_id = p_tenant_id
          AND (
            (p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND w.window_started_at >= p_start_date AND w.window_started_at <= p_end_date)
            OR
            (p_start_date IS NULL AND w.window_started_at >= NOW() - (p_days || ' days')::INTERVAL)
          )
        GROUP BY w.agent_id, a.name, date_trunc('hour', w.window_started_at), (w.metadata->>'campaign_id'), COALESCE((w.metadata->>'reengagement_attempt_count')::integer, COALESCE((w.metadata->>'reengagement_loop')::integer, 0))
        
        ORDER BY recorded_at DESC;
    END;
$$;

COMMIT;
