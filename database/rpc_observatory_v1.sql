-- SQL Script: fn_get_observatory_stats and fn_get_trace_lifecycle
-- Adds logic to support the "Conversation Observatory" UI with real-time health monitoring

-- 1. Get Overall stats for the overview (KPIs and Service Breakdown)
CREATE OR REPLACE FUNCTION public.fn_get_observatory_stats(
    p_tenant_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_avg_latency NUMERIC;
    v_success_rate NUMERIC;
    v_service_breakdown JSONB;
    v_latency_timeline JSONB;
BEGIN
    -- Global metrics for the tenant on the specific date
    SELECT 
        AVG((payload->>'latency_ms')::NUMERIC) / 1000.0,
        (COUNT(*) FILTER (WHERE status = 'success')::NUMERIC / NULLIF(COUNT(*), 0)) * 100
    INTO v_avg_latency, v_success_rate
    FROM public.integration_logs
    WHERE tenant_id = p_tenant_id
      AND processed_at::DATE = p_date;

    -- Breakdown by simulated services (matching the user requirements: Porteiro, n8n, Hub, DB)
    -- This relies on the 'provider' or 'path' identifying the service.
    SELECT jsonb_agg(sub)
    INTO v_service_breakdown
    FROM (
        SELECT 
            CASE 
                WHEN path ILIKE '%porteiro%' OR payload->>'service' = 'porteiro' THEN 'Porteiro'
                WHEN provider = 'n8n' OR path ILIKE '%workflow%' THEN 'n8n'
                WHEN provider = 'hub' THEN 'Hub Engine'
                WHEN provider = 'supabase' OR path ILIKE '%rpc%' THEN 'DB Access'
                ELSE 'Outros'
            END as name,
            AVG((payload->>'latency_ms')::NUMERIC) / 1000.0 as latency,
            (COUNT(*) FILTER (WHERE status = 'success')::NUMERIC / NULLIF(COUNT(*), 0)) * 100 as success_rate
        FROM public.integration_logs
        WHERE tenant_id = p_tenant_id AND processed_at::DATE = p_date
        GROUP BY 1
    ) sub;

    -- Timeline for the chart
    SELECT jsonb_agg(timeline)
    INTO v_latency_timeline
    FROM (
        SELECT 
            TO_CHAR(DATE_TRUNC('hour', processed_at), 'HH24:00') as time,
            AVG(CASE WHEN path ILIKE '%porteiro%' THEN (payload->>'latency_ms')::NUMERIC / 1000.0 END) as porteiro_lat,
            AVG(CASE WHEN provider = 'n8n' THEN (payload->>'latency_ms')::NUMERIC / 1000.0 END) as n8n_lat,
            AVG(CASE WHEN provider = 'hub' THEN (payload->>'latency_ms')::NUMERIC / 1000.0 END) as hub_lat,
            AVG(CASE WHEN provider = 'supabase' THEN (payload->>'latency_ms')::NUMERIC / 1000.0 END) as db_lat,
            COUNT(*) as throughput
        FROM public.integration_logs
        WHERE tenant_id = p_tenant_id AND processed_at::DATE = p_date
        GROUP BY 1
        ORDER BY 1
    ) timeline;

    RETURN jsonb_build_object(
        'avg_latency', COALESCE(v_avg_latency, 0),
        'success_rate', COALESCE(v_success_rate, 0),
        'service_breakdown', COALESCE(v_service_breakdown, '[]'::jsonb),
        'latency_timeline', COALESCE(v_latency_timeline, '[]'::jsonb)
    );
END;
$$;

-- 2. Get detailed Trace Details (Vertical Timeline)
CREATE OR REPLACE FUNCTION public.fn_get_trace_lifecycle(
    p_tenant_id UUID,
    p_phone TEXT DEFAULT NULL,
    p_trace_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_events JSONB;
BEGIN
    SELECT jsonb_agg(ev)
    INTO v_events
    FROM (
        SELECT 
            id,
            CASE 
                WHEN path ILIKE '%porteiro%' THEN 'PORTEIRO'
                WHEN provider = 'n8n' THEN 'WORKFLOW'
                WHEN provider = 'vapi' THEN 'VOICE'
                WHEN provider = 'evolution' THEN 'WHATSAPP'
                ELSE 'SYSTEM'
            END as event_type,
            COALESCE(payload->>'description', 'Evento de sistema capturado') as description,
            processed_at as timestamp,
            status,
            COALESCE(payload->>'latency_ms', '0') || 'ms' as latency,
            payload,
            (SELECT id FROM public.incidents WHERE trace_id = l.trace_id LIMIT 1) as incident_ref
        FROM public.integration_logs l
        WHERE tenant_id = p_tenant_id
          AND (trace_id = p_trace_id OR phone_number = p_phone)
        ORDER BY processed_at ASC
    ) ev;

    RETURN COALESCE(v_events, '[]'::jsonb);
END;
$$;

-- 3. Get Recent Alerts with Person Names
CREATE OR REPLACE FUNCTION public.fn_get_recent_alerts(
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_alerts JSONB;
BEGIN
    SELECT jsonb_agg(a)
    INTO v_alerts
    FROM (
        SELECT 
            l.id,
            l.phone_number as phone,
            COALESCE(c.name, 'Usuário Desconhecido') as name,
            l.status as type,
            l.processed_at as time,
            l.trace_id,
            (SELECT id FROM public.incidents WHERE trace_id = l.trace_id LIMIT 1) as incident_id
        FROM public.integration_logs l
        LEFT JOIN public.contacts c ON c.phone = l.phone_number AND c.tenant_id = l.tenant_id
        WHERE l.tenant_id = p_tenant_id
          AND l.status IN ('error', 'warning')
        ORDER BY l.processed_at DESC
        LIMIT 10
    ) a;

    RETURN COALESCE(v_alerts, '[]'::jsonb);
END;
$$;
