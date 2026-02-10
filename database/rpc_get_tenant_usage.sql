-- =============================================
-- RPC: Get Tenant Usage Summary (Monthly)
-- Description: Aggregates usage metrics for a specific tenant in a given month.
-- Used for: Plan Details Tab in Settings
-- =============================================

CREATE OR REPLACE FUNCTION get_tenant_usage_summary(
    p_tenant_id UUID,
    p_month INT,
    p_year INT
)
RETURNS TABLE (
    total_tokens NUMERIC,
    stt_minutes NUMERIC,
    tts_minutes NUMERIC,
    total_messages BIGINT,
    active_agents BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_date TIMESTAMP WITH TIME ZONE;
    v_end_date TIMESTAMP WITH TIME ZONE;
BEGIN
    v_start_date := make_timestamptz(p_year, p_month, 1, 0, 0, 0);
    v_end_date := v_start_date + INTERVAL '1 month';

    RETURN QUERY
    WITH metrics AS (
        SELECT 
            COALESCE(SUM(CASE WHEN metric_type = 'tokens' THEN value ELSE 0 END), 0) as tokens,
            COALESCE(SUM(CASE WHEN metric_type = 'stt_minutes' THEN value ELSE 0 END), 0) as stt,
            COALESCE(SUM(CASE WHEN metric_type = 'tts_minutes' THEN value ELSE 0 END), 0) as tts
        FROM consumption_metrics
        WHERE tenant_id = p_tenant_id
          AND recorded_at >= v_start_date 
          AND recorded_at < v_end_date
    ),
    message_count AS (
        SELECT COUNT(*) as count
        FROM messages
        WHERE tenant_id = p_tenant_id
          AND created_at >= v_start_date
          AND created_at < v_end_date
    ),
    agent_count AS (
        SELECT COUNT(*) as count
        FROM agents
        WHERE tenant_id = p_tenant_id
          AND status = 'active'
    )
    SELECT
        m.tokens,
        m.stt,
        m.tts,
        mc.count,
        ac.count
    FROM metrics m
    CROSS JOIN message_count mc
    CROSS JOIN agent_count ac;
END;
$$;
