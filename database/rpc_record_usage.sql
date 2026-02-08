-- =============================================
-- RPC: record_usage
-- Description: Safely inserts consumption metrics from N8N without exposing table permissions.
-- Usage: Called via POST /rpc/record_usage
-- =============================================

CREATE OR REPLACE FUNCTION record_usage(
    p_agent_id TEXT,
    p_metric_type TEXT,
    p_value NUMERIC,
    p_cost NUMERIC,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_agent_uuid UUID;
    v_tenant_id UUID;
    v_new_id UUID;
    v_dept_id TEXT;
    v_cost_center TEXT;
    v_total_usage NUMERIC;
    v_limit NUMERIC;
    v_threshold DECIMAL;
    v_alert_triggered BOOLEAN := false;
    v_metric_key TEXT;
    v_plan_details JSONB;
BEGIN
    -- Safe conversion from TEXT to UUID
    v_agent_uuid := p_agent_id::UUID;

    -- 1. Validate Agent and Get Context (Tenant + Dept)
    SELECT tenant_id, department_id, cost_center INTO v_tenant_id, v_dept_id, v_cost_center
    FROM agents
    WHERE id = v_agent_uuid;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Agent not found or invalid';
    END IF;

    -- 2. Insert Metric with Dept Info
    INSERT INTO consumption_metrics (
        tenant_id,
        agent_id,
        channel,
        metric_type,
        value,
        cost,
        metadata,
        department_id,
        cost_center,
        recorded_at
    ) VALUES (
        v_tenant_id,
        v_agent_uuid,
        (SELECT CASE 
            WHEN type = 'whatsapp' THEN 'whatsapp'::conversation_channel 
            WHEN type = 'embedded' THEN 'text'::conversation_channel
            ELSE 'text'::conversation_channel 
         END FROM agents WHERE id = v_agent_uuid),
        p_metric_type::metric_type,
        p_value,
        p_cost,
        p_metadata,
        v_dept_id,
        v_cost_center,
        NOW()
    )
    RETURNING id INTO v_new_id;

    -- 3. Alert Check Logic
    v_metric_key := CASE 
        WHEN p_metric_type = 'tokens' THEN 'llmTokens'
        WHEN p_metric_type = 'messages' THEN 'messages'
        ELSE NULL
    END;

    IF v_metric_key IS NOT NULL THEN
        -- Get current month total for this metric
        SELECT COALESCE(SUM(value), 0) INTO v_total_usage
        FROM consumption_metrics
        WHERE tenant_id = v_tenant_id
          AND metric_type = p_metric_type::metric_type
          AND recorded_at >= date_trunc('month', NOW());

        -- Get limit from plan_details in companies table
        SELECT plan_details INTO v_plan_details
        FROM companies
        WHERE id = v_tenant_id;
        
        v_limit := (v_plan_details->'limits'->>v_metric_key)::NUMERIC;

        -- Check active alerts for this metric
        SELECT threshold_percent INTO v_threshold
        FROM billing_alerts
        WHERE tenant_id = v_tenant_id
          AND metric_type = p_metric_type
          AND is_active = true
        ORDER BY threshold_percent DESC
        LIMIT 1;

        IF v_threshold IS NOT NULL AND COALESCE(v_limit, 0) > 0 THEN
            IF (v_total_usage / v_limit * 100) >= v_threshold THEN
                v_alert_triggered := true;
                
                -- Update last triggered
                UPDATE billing_alerts SET last_triggered_at = NOW()
                WHERE tenant_id = v_tenant_id AND metric_type = p_metric_type AND threshold_percent = v_threshold;
            END IF;
        END IF;
    END IF;

    -- 4. Return Success with Alert Context
    RETURN jsonb_build_object(
        'success', true,
        'metric_id', v_new_id,
        'alert', jsonb_build_object(
            'triggered', v_alert_triggered,
            'threshold', v_threshold
        )
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
