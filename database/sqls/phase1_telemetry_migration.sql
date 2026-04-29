-- =============================================== --
-- DAVOS NEXUS - PHASE 1: TELEMETRY & IDEMPOTENCY  --
-- =============================================== --

-- 1. ADD COLUMNS FOR TRACING AND IDEMPOTENCY
-- We add 'trace_id' and 'idempotency_key' to consumption_metrics.
ALTER TABLE public.consumption_metrics 
ADD COLUMN IF NOT EXISTS trace_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

-- Create unique index to guarantee idempotency on 'idempotency_key' (if provided)
CREATE UNIQUE INDEX IF NOT EXISTS idx_consumption_idempotency 
ON public.consumption_metrics (idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- 2. CREATE FUNCTION TO TRACK CANONICAL LLM USAGE
-- This function receives the exact JSON event from N8N Phase 1 Event Format.
DROP FUNCTION IF EXISTS public.fn_track_llm_usage;

CREATE OR REPLACE FUNCTION public.fn_track_llm_usage(
    p_event JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_trace_id VARCHAR;
    v_idempotency_key VARCHAR;
    v_tenant_id UUID;
    v_agent_id UUID;
    v_model VARCHAR;
    v_prompt_tokens NUMERIC;
    v_completion_tokens NUMERIC;
    v_total_tokens NUMERIC;
    v_metadata JSONB;
    v_channel TEXT;
    
    -- Pricing calculation 
    v_price_input NUMERIC := 0;
    v_price_output NUMERIC := 0;
    v_llm_cost_usd NUMERIC := 0;
    v_brl_rate NUMERIC := 6.0;
    v_cost_brl NUMERIC := 0;
    
    v_new_id UUID;
    v_dept_id TEXT;
    v_cost_center TEXT;
    
    v_err_ctx TEXT;
BEGIN
    -- 1. Extract values from structured event param
    v_trace_id := p_event->>'trace_id';
    v_idempotency_key := p_event->>'idempotency_key';
    v_tenant_id := (p_event->>'tenant_id')::UUID;
    v_agent_id := (p_event->>'agent_id')::UUID;
    v_model := p_event->>'model';
    
    v_prompt_tokens := (p_event->'usage'->>'prompt_tokens')::NUMERIC;
    v_completion_tokens := (p_event->'usage'->>'completion_tokens')::NUMERIC;
    v_total_tokens := COALESCE((p_event->'usage'->>'total_tokens')::NUMERIC, v_prompt_tokens + v_completion_tokens);
    v_metadata := p_event->'metadata';
    v_channel := v_metadata->>'channel';
    
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'invalid_tenant: tenant_id is required';
    END IF;

    -- 2. Check Idempotency First
    IF v_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_new_id FROM public.consumption_metrics WHERE idempotency_key = v_idempotency_key LIMIT 1;
        IF v_new_id IS NOT NULL THEN
            -- Already processed, return success silently
            RETURN jsonb_build_object('success', true, 'metric_id', v_new_id, 'idempotent_hit', true);
        END IF;
    END IF;

    -- 3. Extract agent Context
    IF v_agent_id IS NOT NULL THEN
        SELECT department_id, cost_center INTO v_dept_id, v_cost_center
        FROM agents
        WHERE id = v_agent_id;
    END IF;

    -- 4. Centralized Pricing Logic (Calculated within DB, expelled from Core NodeJS/N8N)
    -- Prices per 1M tokens in USD
    IF v_model = 'gpt-4o' THEN
        v_price_input := 5.00;
        v_price_output := 15.00;
    ELSIF v_model = 'gpt-4o-mini' THEN
        v_price_input := 0.150;
        v_price_output := 0.600;
    ELSE 
        -- fallback to gpt-4o-mini
        v_price_input := 0.150;
        v_price_output := 0.600;
    END IF;
    
    -- Calculate USD cost, then convert to BRL
    v_llm_cost_usd := ((v_prompt_tokens / 1000000.0) * v_price_input) + ((v_completion_tokens / 1000000.0) * v_price_output);
    v_cost_brl := v_llm_cost_usd * v_brl_rate;
    
    -- Append costs to metadata for auditability
    v_metadata := v_metadata || jsonb_build_object(
        'cost_usd', ROUND(v_llm_cost_usd, 6),
        'model', v_model,
        'prompt_tokens', v_prompt_tokens,
        'completion_tokens', v_completion_tokens
    );

    -- 5. Insert Metric safely
    INSERT INTO consumption_metrics (
        tenant_id,
        agent_id,
        channel,
        metric_type,
        value,
        cost,
        currency,
        metadata,
        department_id,
        cost_center,
        trace_id,
        idempotency_key,
        recorded_at
    ) VALUES (
        v_tenant_id,
        v_agent_id,
        COALESCE(v_channel::conversation_channel, 'text'::conversation_channel),
        'tokens'::metric_type,
        v_total_tokens,
        ROUND(v_cost_brl, 6),
        'BRL',
        v_metadata,
        v_dept_id,
        v_cost_center,
        v_trace_id,
        v_idempotency_key,
        NOW()
    )
    RETURNING id INTO v_new_id;

    -- 6. Return Success
    RETURN jsonb_build_object(
        'success', true,
        'metric_id', v_new_id,
        'cost_brl', ROUND(v_cost_brl, 6),
        'cost_usd', ROUND(v_llm_cost_usd, 6)
    );
EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_ctx = PG_EXCEPTION_CONTEXT;
    RAISE LOG 'fn_track_llm_usage error: % %', SQLERRM, v_err_ctx;
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
