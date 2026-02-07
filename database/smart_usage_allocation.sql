-- =============================================
-- RPC: check_consumption_allowance (V2)
-- Description: Refactored to JOIN with plans table as Source of Truth.
-- =============================================

CREATE OR REPLACE FUNCTION check_consumption_allowance(
    p_agent_id UUID,
    p_metric_type metric_type,
    p_requested_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_plan_id TEXT;
    v_default_limits JSONB;
    v_allocation_mode VARCHAR;
    v_limit_value NUMERIC;
    
    v_company_usage NUMERIC;
    v_agent_usage NUMERIC;
    v_agent_share_pct INT;
    v_agent_limit NUMERIC;
    v_brain_config JSONB;
    
    v_metric_key TEXT;
BEGIN
    -- 1. Map metric_type to JSON key
    v_metric_key := CASE 
        WHEN p_metric_type = 'tokens' THEN 'llmTokens'
        WHEN p_metric_type = 'messages' THEN 'messages'
        WHEN p_metric_type = 'stt_minutes' THEN 'sttMinutes'
        WHEN p_metric_type = 'tts_minutes' THEN 'ttsMinutes'
        ELSE NULL
    END;

    IF v_metric_key IS NULL THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'Invalid metric type');
    END IF;

    -- 2. Get Context (JOINing Agent -> Company -> Plan)
    SELECT a.tenant_id, a.brain_config, c.plan_tier, p.default_limits, 
           COALESCE(c.plan_details->>'allocation_mode', 'flexible')
    INTO v_tenant_id, v_brain_config, v_plan_id, v_default_limits, v_allocation_mode
    FROM agents a
    JOIN companies c ON a.tenant_id = c.id
    JOIN plans p ON c.plan_tier = p.id
    WHERE a.id = p_agent_id;

    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'Agent or Plan not found');
    END IF;

    -- 3. Get Limit from Plan Catalog
    v_limit_value := COALESCE((v_default_limits->>v_metric_key)::NUMERIC, 0);

    -- 4. Calculate Current Usage (Company Wide)
    SELECT COALESCE(SUM(value), 0) INTO v_company_usage
    FROM consumption_metrics
    WHERE tenant_id = v_tenant_id
      AND metric_type = p_metric_type
      AND recorded_at >= date_trunc('month', CURRENT_DATE);

    -- 5. Business Logic
    
    -- CASE 1: FLEXIBLE (Shared Pool)
    IF v_allocation_mode = 'flexible' THEN
        IF (v_company_usage + p_requested_amount) <= v_limit_value THEN
            RETURN jsonb_build_object(
                'allowed', true, 
                'mode', 'flexible',
                'metric', v_metric_key,
                'balance', (v_limit_value - v_company_usage)
            );
        ELSE
            RETURN jsonb_build_object(
                'allowed', false, 
                'reason', 'Company ' || v_metric_key || ' limit exceeded',
                'balance', (v_limit_value - v_company_usage)
            );
        END IF;

    -- CASE 2: CUSTOM (Agent Quota)
    ELSIF v_allocation_mode = 'custom' THEN
        v_agent_share_pct := COALESCE((v_brain_config->>'budget_share_pct')::INT, 0);
        v_agent_limit := (v_limit_value * v_agent_share_pct) / 100;
        
        SELECT COALESCE(SUM(value), 0) INTO v_agent_usage
        FROM consumption_metrics
        WHERE agent_id = p_agent_id
          AND metric_type = p_metric_type
          AND recorded_at >= date_trunc('month', CURRENT_DATE);
          
        IF (v_agent_usage + p_requested_amount) <= v_agent_limit THEN
             -- Safety Net (Global Limit)
             IF (v_company_usage + p_requested_amount) <= v_limit_value THEN
                RETURN jsonb_build_object(
                    'allowed', true, 
                    'mode', 'custom',
                    'metric', v_metric_key,
                    'agent_balance', (v_agent_limit - v_agent_usage)
                );
             ELSE
                 RETURN jsonb_build_object('allowed', false, 'reason', 'Company global ' || v_metric_key || ' limit exceeded');
             END IF;
        ELSE
            RETURN jsonb_build_object(
                'allowed', false, 
                'reason', 'Agent ' || v_metric_key || ' quota exceeded (' || v_agent_share_pct || '%)',
                'agent_balance', (v_agent_limit - v_agent_usage)
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('allowed', false, 'reason', 'Unknown Mode');
END;
$$;
