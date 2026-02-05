-- =============================================
-- Migration: Get Detailed Consumption Metrics (Fixed)
-- =============================================

DROP FUNCTION IF EXISTS get_detailed_consumption(UUID, INT);

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
AS $$
BEGIN
    RETURN QUERY
    -- 1. Real billable metrics (Tokens, STT, TTS)
    SELECT 
        cm.id,
        cm.agent_id,
        a.name as agent_name,
        cm.channel::VARCHAR,
        cm.metric_type::VARCHAR,
        cm.value,
        cm.cost,
        cm.recorded_at
    FROM consumption_metrics cm
    LEFT JOIN agents a ON cm.agent_id = a.id
    WHERE cm.tenant_id = p_tenant_id
      AND cm.recorded_at >= NOW() - (p_days || ' days')::INTERVAL
      AND cm.metric_type != 'messages' -- Avoid duplicates if N8N also records messages

    UNION ALL

    -- 2. Synthetic metrics from messages table (Aggregated by hour to keep it lite)
    -- Joining with conversations to get the agent_id and channel
    SELECT 
        NULL::UUID as id,
        conv.agent_id,
        COALESCE(a.name, 'Agente')::VARCHAR as agent_name,
        COALESCE(conv.channel::VARCHAR, 'Agente')::VARCHAR as channel, -- Ensure channel is not NULL, changed 'text' to 'Agente' for consistency
        'messages'::VARCHAR as metric_type,
        COUNT(*)::NUMERIC as value,
        0::NUMERIC as cost, -- Cost will be calculated via plan prices in frontend
        date_trunc('hour', m.created_at) as recorded_at
    FROM messages m
    LEFT JOIN conversations conv ON m.conversation_id = conv.id
    LEFT JOIN agents a ON conv.agent_id = a.id
    WHERE m.tenant_id = p_tenant_id
      AND m.created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY conv.agent_id, a.name, conv.channel, date_trunc('hour', m.created_at)
    
    ORDER BY recorded_at DESC;
END;
$$;
