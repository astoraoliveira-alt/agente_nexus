-- =============================================
-- SMART USAGE ALLOCATION
-- Description: Enables Flexible vs Custom limits for Agents
-- =============================================

-- 1. Migration: Set Default Mode to 'flexible' for all existing companies
UPDATE companies
SET plan_details = jsonb_set(
    COALESCE(plan_details, '{}'::jsonb),
    '{allocation_mode}',
    '"flexible"'
)
WHERE plan_details->>'allocation_mode' IS NULL;

-- 2. RPC: Check Consumption Allowance
-- Usage: Called by N8N before processing a message
-- Returns: { allowed: boolean, reason: string, remaining: number }

CREATE OR REPLACE FUNCTION check_consumption_allowance(
    p_agent_id UUID,
    p_estimated_cost NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_plan_details JSONB;
    v_allocation_mode VARCHAR;
    v_monthly_limit NUMERIC;
    
    v_company_usage NUMERIC;
    v_agent_usage NUMERIC;
    v_agent_share_pct INT;
    v_agent_limit NUMERIC;
    v_brain_config JSONB;
BEGIN
    -- A. Get Context
    SELECT tenant_id, brain_config INTO v_tenant_id, v_brain_config
    FROM agents
    WHERE id = p_agent_id;

    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'Agent not found');
    END IF;

    -- B. Get Company Plan & Configuration
    SELECT plan_details INTO v_plan_details
    FROM companies
    WHERE id = v_tenant_id;

    v_allocation_mode := COALESCE(v_plan_details->>'allocation_mode', 'flexible');
    v_monthly_limit := COALESCE((v_plan_details->>'monthly_limit_brl')::NUMERIC, 0);

    -- C. Calculate Current Usage (Company Wide) for the current month
    -- Improvements: In production, this should come from a materialized view or cache
    SELECT COALESCE(SUM(cost), 0) INTO v_company_usage
    FROM consumption_metrics
    WHERE tenant_id = v_tenant_id
      AND recorded_at >= date_trunc('month', CURRENT_DATE);

    -- D. Check Logic
    
    -- CASE 1: FLEXIBLE (Shared Pool)
    IF v_allocation_mode = 'flexible' THEN
        IF (v_company_usage + p_estimated_cost) <= v_monthly_limit THEN
            RETURN jsonb_build_object(
                'allowed', true, 
                'mode', 'flexible',
                'balance', (v_monthly_limit - v_company_usage)
            );
        ELSE
            RETURN jsonb_build_object(
                'allowed', false, 
                'reason', 'Company Allowance Exceeded',
                'balance', (v_monthly_limit - v_company_usage)
            );
        END IF;

    -- CASE 2: CUSTOM (Agent Quota)
    ELSIF v_allocation_mode = 'custom' THEN
        -- Get Agent Share % from Agent Config (default 0 if custom mode but not set)
        -- We look for 'budget_share_pct' in brain_config or a specific config column
        -- Assuming we add it to brain_config for now purely for storage
        v_agent_share_pct := COALESCE((v_brain_config->>'budget_share_pct')::INT, 0);
        
        -- Calculate Agent's Personal Limit
        v_agent_limit := (v_monthly_limit * v_agent_share_pct) / 100;
        
        -- Get Agent's Usage
        SELECT COALESCE(SUM(cost), 0) INTO v_agent_usage
        FROM consumption_metrics
        WHERE agent_id = p_agent_id
          AND recorded_at >= date_trunc('month', CURRENT_DATE);
          
        IF (v_agent_usage + p_estimated_cost) <= v_agent_limit THEN
             -- ALSO Check Global Limit (Safety Net)
             IF (v_company_usage + p_estimated_cost) <= v_monthly_limit THEN
                RETURN jsonb_build_object(
                    'allowed', true, 
                    'mode', 'custom',
                    'agent_balance', (v_agent_limit - v_agent_usage)
                );
             ELSE
                 RETURN jsonb_build_object('allowed', false, 'reason', 'Company Global Limit Exceeded');
             END IF;
        ELSE
            RETURN jsonb_build_object(
                'allowed', false, 
                'reason', 'Agent Quota Exceeded (' || v_agent_share_pct || '%)',
                'agent_balance', (v_agent_limit - v_agent_usage)
            );
        END IF;
    END IF;

    -- Fallback
    RETURN jsonb_build_object('allowed', false, 'reason', 'Unknown Mode');
END;
$$;
