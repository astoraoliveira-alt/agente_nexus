-- =============================================
-- Migration: Update get_agent_usage_stats
-- Description: Adds messages and voice metrics to the aggregation.
-- =============================================

DROP FUNCTION IF EXISTS get_agent_usage_stats(UUID);

CREATE OR REPLACE FUNCTION get_agent_usage_stats(p_tenant_id UUID)
RETURNS TABLE (
    agent_id UUID,
    total_tokens NUMERIC,
    total_messages NUMERIC,
    total_stt NUMERIC,
    total_tts NUMERIC,
    recorded_cost NUMERIC -- This is the raw cost recorded in metrics
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    -- 1. Consumption Metrics Aggregation
    WITH metrics_agg AS (
        SELECT 
            cm.agent_id,
            SUM(CASE WHEN cm.metric_type = 'tokens' THEN cm.value ELSE 0 END) as total_tokens,
            SUM(CASE WHEN cm.metric_type = 'messages' THEN cm.value ELSE 0 END) as total_messages_recorded,
            SUM(CASE WHEN cm.metric_type = 'stt_minutes' THEN cm.value ELSE 0 END) as total_stt,
            SUM(CASE WHEN cm.metric_type = 'tts_minutes' THEN cm.value ELSE 0 END) as total_tts,
            SUM(cm.cost) as total_cost
        FROM consumption_metrics cm
        WHERE cm.tenant_id = p_tenant_id
        GROUP BY cm.agent_id
    ),
    -- 2. Message Count from Conversations (Synthetic)
    -- We join with conversations to get the agent_id
    msg_agg AS (
        SELECT 
            conv.agent_id,
            COUNT(*) as total_messages_synthetic
        FROM messages m
        JOIN conversations conv ON m.conversation_id = conv.id
        WHERE m.tenant_id = p_tenant_id
        GROUP BY conv.agent_id
    )
    SELECT 
        COALESCE(metrics.agent_id, msgs.agent_id) as agent_id,
        COALESCE(metrics.total_tokens, 0) as total_tokens,
        -- Use synthetic count if available, otherwise recorded
        GREATEST(COALESCE(metrics.total_messages_recorded, 0), COALESCE(msgs.total_messages_synthetic, 0)) as total_messages,
        COALESCE(metrics.total_stt, 0) as total_stt,
        COALESCE(metrics.total_tts, 0) as total_tts,
        COALESCE(metrics.total_cost, 0) as recorded_cost
    FROM metrics_agg metrics
    FULL OUTER JOIN msg_agg msgs ON metrics.agent_id = msgs.agent_id;
END;
$$;
