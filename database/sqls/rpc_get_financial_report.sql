-- =============================================
-- RPC: get_financial_report
-- Description: Aggregates Revenue vs Costs (Fixed & Variable) per company for a given month.
-- Usage: Called via POST /rpc/get_financial_report
-- =============================================

DROP FUNCTION IF EXISTS get_financial_report(integer,integer);

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
            COALESCE(SUM(CASE WHEN cm.metric_type = 'messages' THEN cm.value ELSE 0 END), 0) as val_msgs_recorded,
            COALESCE(SUM(CASE WHEN cm.metric_type = 'whatsapp_window_24h' THEN cm.value ELSE 0 END), 0) as val_wa_windows
        FROM consumption_metrics cm
        WHERE cm.recorded_at >= v_start_date AND cm.recorded_at < v_end_date
        GROUP BY cm.tenant_id
    ),
    message_counts AS (
        SELECT 
            m.tenant_id,
            COUNT(*) as total_msgs
        FROM messages m
        LEFT JOIN conversations conv ON m.conversation_id = conv.id
        WHERE m.created_at >= v_start_date AND m.created_at < v_end_date
          AND NOT (
            conv.channel = 'whatsapp'::public.conversation_channel
            AND COALESCE(conv.metadata->>'whatsapp_billing_mode', '') = 'window_24h'
            AND m.created_at >= COALESCE(
              NULLIF(conv.metadata->>'whatsapp_billing_mode_applied_at', '')::timestamptz,
              conv.created_at,
              v_start_date
            )
          )
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
            MAX(CASE WHEN cdc.item_key = 'twilio_variable' THEN cdc.cost_value ELSE 0 END) as twilio_var_rate,
            MAX(CASE WHEN cdc.item_key = 'msg_whatsapp' THEN cdc.cost_value ELSE 0 END) as whatsapp_rate
        FROM company_davos_costs cdc
        GROUP BY cdc.tenant_id
    ),
    raw_calculations AS (
        SELECT 
            c.id as raw_tenant_id,
            c.name::TEXT as raw_company_name,
            p.name::TEXT as raw_plan_name,
            COALESCE(p.base_price, 0)::NUMERIC as raw_revenue_fixed,
            COALESCE(p.monthly_fee_covers_usage, FALSE) as raw_monthly_fee_covers_usage,
            (
                (COALESCE(rm.val_llm, 0) / 1000.0 * COALESCE(p.llm_token_price, 0)) + 
                (COALESCE(rm.val_stt, 0) * COALESCE(p.stt_minute_price, 0)) + 
                (COALESCE(rm.val_tts, 0) * COALESCE(p.tts_minute_price, 0)) +
                (COALESCE(rm.val_msgs_recorded, 0) * COALESCE(p.message_price, 0)) +
                (COALESCE(mc.total_msgs, 0) * COALESCE(p.message_price, 0)) +
                (
                  COALESCE(rm.val_wa_windows, 0) * COALESCE(
                    NULLIF(c.plan_prices->>'whatsappWindowPrice', '')::NUMERIC,
                    NULLIF(c.plan_prices->>'whatsapp_window_price', '')::NUMERIC,
                    p.whatsapp_window_price,
                    0
                  )
                )
            ) as raw_revenue_variable,
            COALESCE(tfc.total_fixed_cost, 0) as raw_cost_fixed,
            ((COALESCE(rm.val_llm, 0) / 1000.0) * COALESCE(tr.llm_rate, 0.05)) as raw_cost_variable_llm,
            ((COALESCE(rm.val_stt, 0) + COALESCE(rm.val_tts, 0)) * COALESCE(tr.voice_rate, 0.15)) as raw_cost_variable_voice,
            ((COALESCE(rm.val_stt, 0) + COALESCE(rm.val_tts, 0)) * COALESCE(tr.twilio_var_rate, 0)) as raw_cost_variable_other,
            ((COALESCE(rm.val_msgs_recorded, 0) + COALESCE(mc.total_msgs, 0) + COALESCE(rm.val_wa_windows, 0)) * COALESCE(tr.whatsapp_rate, 0.05)) as raw_cost_variable_whatsapp
        FROM companies c
        LEFT JOIN plans p ON c.plan_tier = p.id
        LEFT JOIN revenue_metrics rm ON c.id = rm.tenant_id
        LEFT JOIN message_counts mc ON c.id = mc.tenant_id
        LEFT JOIN tenant_fixed_costs tfc ON c.id = tfc.tenant_id
        LEFT JOIN tenant_rates tr ON c.id = tr.tenant_id
    )
    SELECT 
        raw_tenant_id as tenant_id,
        raw_company_name as company_name,
        raw_plan_name as plan_name,
        raw_revenue_fixed as revenue_fixed,
        ROUND((
            CASE 
                WHEN raw_monthly_fee_covers_usage THEN GREATEST(0, raw_revenue_variable - raw_revenue_fixed)
                ELSE raw_revenue_variable 
            END
        ), 2)::NUMERIC as revenue_variable,
        ROUND(raw_cost_fixed, 2)::NUMERIC as cost_fixed,
        ROUND(raw_cost_variable_llm, 2)::NUMERIC as cost_variable_llm,
        ROUND(raw_cost_variable_voice, 2)::NUMERIC as cost_variable_voice,
        ROUND(raw_cost_variable_other + raw_cost_variable_whatsapp, 2)::NUMERIC as cost_variable_other,
        ROUND((
            raw_revenue_fixed + 
            CASE 
                WHEN raw_monthly_fee_covers_usage THEN GREATEST(0, raw_revenue_variable - raw_revenue_fixed)
                ELSE raw_revenue_variable 
            END
        ) - (
            raw_cost_fixed + raw_cost_variable_llm + raw_cost_variable_voice + raw_cost_variable_other + raw_cost_variable_whatsapp
        ), 2)::NUMERIC as net_margin
    FROM raw_calculations
    ORDER BY 10 DESC;
END;
$$;
