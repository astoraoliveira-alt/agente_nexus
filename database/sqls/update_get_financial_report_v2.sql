-- RPC: get_financial_report (v2)
-- Description: Aggregates Revenue vs Costs per company for a given month.
-- Change: Exclude 'suspended' companies from the report.

CREATE OR REPLACE FUNCTION get_financial_report(
    p_month INT,
    p_year INT
)
RETURNS TABLE (
    tenant_id UUID,
    company_name TEXT,
    plan_name TEXT,
    revenue_fixed NUMERIC,
    revenue_variable NUMERIC,
    cost_fixed NUMERIC,
    cost_variable_llm NUMERIC,
    cost_variable_voice NUMERIC,
    cost_variable_other NUMERIC,
    net_margin NUMERIC
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
    WITH revenue_metrics AS (
        SELECT 
            cm.tenant_id,
            COALESCE(SUM(CASE WHEN cm.metric_type = 'tokens' THEN cm.value ELSE 0 END), 0) as val_llm,
            COALESCE(SUM(CASE WHEN cm.metric_type = 'stt_minutes' THEN cm.value ELSE 0 END), 0) as val_stt,
            COALESCE(SUM(CASE WHEN cm.metric_type = 'tts_minutes' THEN cm.value ELSE 0 END), 0) as val_tts,
            COALESCE(SUM(CASE WHEN cm.metric_type = 'messages' THEN cm.value ELSE 0 END), 0) as val_msgs_recorded
        FROM consumption_metrics cm
        WHERE cm.recorded_at >= v_start_date AND cm.recorded_at < v_end_date
        GROUP BY cm.tenant_id
    ),
    message_counts AS (
        SELECT 
            m.tenant_id,
            COUNT(*) as total_msgs
        FROM messages m
        WHERE m.created_at >= v_start_date AND m.created_at < v_end_date
        GROUP BY m.tenant_id
    ),
    tenant_fixed_costs AS (
        SELECT 
            cdc.tenant_id,
            COALESCE(SUM(CASE WHEN cdc.is_recurring = TRUE THEN cdc.cost_value ELSE 0 END), 0) as total_fixed_cost
        FROM company_davos_costs cdc
        GROUP BY cdc.tenant_id
    ),
    tenant_rates AS (
        SELECT 
            cdc.tenant_id,
            MAX(CASE WHEN cdc.item_key = 'llm_internal_rate' THEN cdc.cost_value ELSE 0 END) as llm_rate,
            MAX(CASE WHEN cdc.item_key = 'voice_internal_rate' THEN cdc.cost_value ELSE 0 END) as voice_rate,
            MAX(CASE WHEN cdc.item_key = 'twilio_variable' THEN cdc.cost_value ELSE 0 END) as twilio_var_rate
        FROM company_davos_costs cdc
        GROUP BY cdc.tenant_id
    )
    SELECT 
        c.id as tenant_id,
        c.name::TEXT as company_name,
        p.name::TEXT as plan_name,
        COALESCE(p.base_price, 0)::NUMERIC as revenue_fixed,
        ROUND((
            (COALESCE(rm.val_llm, 0) / 1000.0 * COALESCE(p.llm_token_price, 0)) + 
            (COALESCE(rm.val_stt, 0) * COALESCE(p.stt_minute_price, 0)) + 
            (COALESCE(rm.val_tts, 0) * COALESCE(p.tts_minute_price, 0)) +
            (COALESCE(rm.val_msgs_recorded, 0) * COALESCE(p.message_price, 0)) +
            (COALESCE(mc.total_msgs, 0) * COALESCE(p.message_price, 0))
        ), 2)::NUMERIC as revenue_variable,
        ROUND(COALESCE(tfc.total_fixed_cost, 0), 2)::NUMERIC as cost_fixed,
        -- Variable Internal Costs Using Dynamic Rates
        ROUND(((COALESCE(rm.val_llm, 0) / 1000.0) * COALESCE(tr.llm_rate, 0.05)), 2)::NUMERIC as cost_variable_llm,
        ROUND(((COALESCE(rm.val_stt, 0) + COALESCE(rm.val_tts, 0)) * COALESCE(tr.voice_rate, 0.15)), 2)::NUMERIC as cost_variable_voice,
        ROUND((((COALESCE(rm.val_stt, 0) + COALESCE(rm.val_tts, 0))) * COALESCE(tr.twilio_var_rate, 0)), 2)::NUMERIC as cost_variable_other,
        -- Margin Calculation
        ROUND((
            COALESCE(p.base_price, 0) + 
            (
                (COALESCE(rm.val_llm, 0) / 1000.0 * COALESCE(p.llm_token_price, 0)) + 
                (COALESCE(rm.val_stt, 0) * COALESCE(p.stt_minute_price, 0)) + 
                (COALESCE(rm.val_tts, 0) * COALESCE(p.tts_minute_price, 0)) +
                (COALESCE(rm.val_msgs_recorded, 0) * COALESCE(p.message_price, 0)) +
                (COALESCE(mc.total_msgs, 0) * COALESCE(p.message_price, 0))
            )
        ) - (
            COALESCE(tfc.total_fixed_cost, 0) + 
            ((COALESCE(rm.val_llm, 0) / 1000.0) * COALESCE(tr.llm_rate, 0.05)) + 
            ((COALESCE(rm.val_stt, 0) + COALESCE(rm.val_tts, 0)) * COALESCE(tr.voice_rate, 0.15)) +
            ((COALESCE(rm.val_stt, 0) + COALESCE(rm.val_tts, 0)) * COALESCE(tr.twilio_var_rate, 0))
        ), 2) as net_margin
    FROM companies c
    LEFT JOIN plans p ON c.plan_tier = p.id
    LEFT JOIN revenue_metrics rm ON c.id = rm.tenant_id
    LEFT JOIN message_counts mc ON c.id = mc.tenant_id
    LEFT JOIN tenant_fixed_costs tfc ON c.id = tfc.tenant_id
    LEFT JOIN tenant_rates tr ON c.id = tr.tenant_id
    WHERE c.status != 'suspended'  -- FILTER ADDED HERE
    ORDER BY net_margin DESC;
END;
$$;
