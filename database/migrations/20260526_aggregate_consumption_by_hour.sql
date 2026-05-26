-- ==========================================================
-- Migration: Aggregate Consumption Metrics by Hour (Fixes PostgREST Truncation Limit)
-- Date: 2026-05-26
-- ==========================================================

CREATE OR REPLACE FUNCTION get_detailed_consumption(
    p_tenant_id UUID,
    p_days INT
)
RETURNS TABLE (
    id UUID,
    agent_id UUID,
    agent_name VARCHAR,
    channel VARCHAR,
    metric_type VARCHAR,
    value NUMERIC,
    cost NUMERIC,
    recorded_at TIMESTAMP WITH TIME ZONE
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
            date_trunc('hour', cm.recorded_at) as recorded_at
        FROM consumption_metrics cm
        LEFT JOIN agents a ON cm.agent_id = a.id
        WHERE cm.tenant_id = p_tenant_id
          AND cm.recorded_at >= NOW() - (p_days || ' days')::INTERVAL
          AND cm.metric_type != 'messages'
        GROUP BY cm.agent_id, a.name, cm.channel, cm.metric_type, date_trunc('hour', cm.recorded_at)

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
            date_trunc('hour', m.created_at) as recorded_at
        FROM messages m
        LEFT JOIN conversations conv ON m.conversation_id = conv.id
        LEFT JOIN agents a ON conv.agent_id = a.id
        WHERE m.tenant_id = p_tenant_id
          AND m.created_at >= NOW() - (p_days || ' days')::INTERVAL
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
        GROUP BY conv.agent_id, a.name, conv.channel, date_trunc('hour', m.created_at)
        
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
            date_trunc('hour', w.window_started_at) as recorded_at
        FROM whatsapp_billing_windows w
        LEFT JOIN agents a ON w.agent_id = a.id
        WHERE w.tenant_id = p_tenant_id
          AND w.window_started_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY w.agent_id, a.name, date_trunc('hour', w.window_started_at)
        
        ORDER BY recorded_at DESC;
    END;
$$;
