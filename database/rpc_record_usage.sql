-- =============================================
-- RPC: record_usage
-- Description: Safely inserts consumption metrics from N8N without exposing table permissions.
-- Usage: Called via POST /rpc/record_usage
-- =============================================

CREATE OR REPLACE FUNCTION record_usage(
    p_agent_id UUID,
    p_metric_type metric_type, -- 'tokens', 'messages', etc.
    p_value NUMERIC,
    p_cost NUMERIC,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with privileges of the creator (admin), bypassing RLS for the insert if needed, but we check tenant context
AS $$
DECLARE
    v_tenant_id UUID;
    v_new_id UUID;
BEGIN
    -- 1. Validate Agent and Get Tenant
    SELECT tenant_id INTO v_tenant_id
    FROM agents
    WHERE id = p_agent_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Agent not found or invalid';
    END IF;

    -- 2. Insert Metric
    INSERT INTO consumption_metrics (
        tenant_id,
        agent_id,
        channel,
        metric_type,
        value,
        cost,
        metadata,
        recorded_at
    ) VALUES (
        v_tenant_id,
        p_agent_id,
        (SELECT CASE 
            WHEN type = 'whatsapp' THEN 'whatsapp'::conversation_channel 
            WHEN type = 'embedded' THEN 'text'::conversation_channel
            ELSE 'text'::conversation_channel 
         END FROM agents WHERE id = p_agent_id),
        p_metric_type,
        p_value,
        p_cost,
        p_metadata,
        NOW()
    )
    RETURNING id INTO v_new_id;

    -- 3. Return Success
    RETURN jsonb_build_object(
        'success', true,
        'metric_id', v_new_id,
        'tenant_id', v_tenant_id
    );
END;
$$;

-- =============================================
-- RPC: get_agent_usage_stats
-- Description: Aggregates usage for a specific agent (or all if NULL)
-- Usage: Called via POST /rpc/get_agent_usage_stats
-- =============================================
CREATE OR REPLACE FUNCTION get_agent_usage_stats(p_tenant_id UUID)
RETURNS TABLE (
    agent_id UUID,
    total_tokens NUMERIC,
    total_cost NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cm.agent_id,
        SUM(CASE WHEN cm.metric_type = 'tokens' THEN cm.value ELSE 0 END) as total_tokens,
        SUM(cm.cost) as total_cost
    FROM consumption_metrics cm
    WHERE cm.tenant_id = p_tenant_id
    GROUP BY cm.agent_id;
END;
$$;
