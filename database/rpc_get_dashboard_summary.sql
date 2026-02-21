-- =============================================
-- PERFORMANCE OPTIMIZATION: RPC CONSOLIDATION
-- Target: Index 4 (getAgents) < 400ms
-- =============================================

-- 1. Optimize get_agent_usage_stats
-- Removes inefficient subquery per conversation
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
    WITH metrics_agg AS (
        -- Aggregated consumption metrics
        SELECT 
            cm.agent_id,
            SUM(CASE WHEN cm.metric_type = 'tokens' THEN cm.value ELSE 0 END) as tokens,
            SUM(CASE WHEN cm.metric_type = 'messages' THEN cm.value ELSE 0 END) as msgs_recorded,
            SUM(CASE WHEN cm.metric_type = 'stt_minutes' THEN cm.value ELSE 0 END) as stt,
            SUM(CASE WHEN cm.metric_type = 'tts_minutes' THEN cm.value ELSE 0 END) as tts,
            SUM(cm.cost) as cost
        FROM consumption_metrics cm
        WHERE cm.tenant_id = p_tenant_id
        GROUP BY cm.agent_id
    ),
    msg_counts AS (
        -- Efficient message counting via join instead of scalar subquery
        SELECT 
            c.agent_id,
            COUNT(m.id) as msgs_synthetic
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        WHERE c.tenant_id = p_tenant_id
        GROUP BY c.agent_id
    ),
    conv_agg AS (
        -- Efficient conversation counting
        SELECT 
            c.agent_id,
            COUNT(*) as total_convs,
            COUNT(*) FILTER (WHERE c.status != 'closed') as active_convs
        FROM conversations c
        WHERE c.tenant_id = p_tenant_id
        GROUP BY c.agent_id
    )
    SELECT 
        a.id as agent_id,
        COALESCE(metrics.tokens, 0)::numeric as total_tokens,
        GREATEST(COALESCE(metrics.msgs_recorded, 0), COALESCE(mc.msgs_synthetic, 0))::numeric as total_messages,
        COALESCE(metrics.stt, 0)::numeric as total_stt,
        COALESCE(metrics.tts, 0)::numeric as total_tts,
        COALESCE(metrics.cost, 0)::numeric as recorded_cost,
        COALESCE(ca.total_convs, 0)::numeric as total_conversations,
        COALESCE(ca.active_convs, 0)::numeric as active_conversations
    FROM agents a
    LEFT JOIN metrics_agg metrics ON a.id = metrics.agent_id
    LEFT JOIN msg_counts mc ON a.id = mc.agent_id
    LEFT JOIN conv_agg ca ON a.id = ca.agent_id
    WHERE a.tenant_id = p_tenant_id;
END;
$$;

-- 2. Master Dashboard RPC: get_dashboard_summary
-- Consolidates Agents + Stats + Company Info
CREATE OR REPLACE FUNCTION get_dashboard_summary(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_agents JSONB;
    v_company JSONB;
BEGIN
    -- 1. Fetch Agents with their consolidated stats
    SELECT jsonb_agg(sub) INTO v_agents
    FROM (
        SELECT 
            a.*,
            s.total_tokens,
            s.total_messages,
            s.total_stt,
            s.total_tts,
            s.recorded_cost,
            s.total_conversations,
            s.active_conversations
        FROM agents a
        LEFT JOIN LATERAL get_agent_usage_stats(p_tenant_id) s ON s.agent_id = a.id
        WHERE a.tenant_id = p_tenant_id
    ) sub;

    -- 2. Fetch Company Info with Plan Prices
    SELECT jsonb_build_object(
        'company', c.*,
        'plan', p.*
    ) INTO v_company
    FROM companies c
    LEFT JOIN plans p ON p.id = c.plan_tier
    WHERE c.id = p_tenant_id;

    RETURN jsonb_build_object(
        'agents', COALESCE(v_agents, '[]'::jsonb),
        'tenant', v_company
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_agent_usage_stats(UUID) TO authenticated;
