-- =============================================
-- Migration: Optimize get_agent_usage_stats
-- Description: Adds conversation counts directly from the DB to avoid frontend memory bloat and latency.
-- =============================================

DROP FUNCTION IF EXISTS get_agent_usage_stats(UUID);

CREATE OR REPLACE FUNCTION get_agent_usage_stats(p_tenant_id UUID)
RETURNS TABLE (
    agent_id UUID,
    total_tokens NUMERIC,
    total_messages NUMERIC,
    total_stt NUMERIC,
    total_tts NUMERIC,
    recorded_cost NUMERIC,
    total_conversations NUMERIC,
    active_conversations NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    -- 2. Message Count Synthesis & Conversation Count
    conv_agg AS (
        SELECT 
            conv.agent_id,
            COUNT(*) as total_conversations,
            COUNT(*) FILTER (WHERE conv.status != 'closed') as active_conversations,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = conv.id) as total_messages_synthetic
        FROM conversations conv
        WHERE conv.tenant_id = p_tenant_id
        GROUP BY conv.agent_id, conv.id
    ),
    msg_agg AS (
        SELECT 
            conv_agg.agent_id,
            SUM(conv_agg.total_messages_synthetic) as total_messages_synthetic,
            COUNT(conv_agg.total_conversations) as total_conversations,
            SUM(conv_agg.active_conversations) as active_conversations
        FROM conv_agg
        GROUP BY conv_agg.agent_id
    )
    SELECT 
        COALESCE(metrics.agent_id, msgs.agent_id) as agent_id,
        COALESCE(metrics.total_tokens, 0)::numeric as total_tokens,
        GREATEST(COALESCE(metrics.total_messages_recorded, 0), COALESCE(msgs.total_messages_synthetic, 0))::numeric as total_messages,
        COALESCE(metrics.total_stt, 0)::numeric as total_stt,
        COALESCE(metrics.total_tts, 0)::numeric as total_tts,
        COALESCE(metrics.total_cost, 0)::numeric as recorded_cost,
        COALESCE(msgs.total_conversations, 0)::numeric as total_conversations,
        COALESCE(msgs.active_conversations, 0)::numeric as active_conversations
    FROM metrics_agg metrics
    FULL OUTER JOIN msg_agg msgs ON metrics.agent_id = msgs.agent_id;
END;
$$;
