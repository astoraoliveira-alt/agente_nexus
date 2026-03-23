-- ================================================================= --
-- DAVOS NEXUS - MISSION CONTROL V2 - DATE FILTERS + ERROR SEARCH    --
-- ================================================================= --
-- Run this AFTER mission_control_rpc_kit.sql                         --
-- ================================================================= --

-- 1. HEALTH STATS WITH DATE RANGE SUPPORT
CREATE OR REPLACE FUNCTION public.fn_get_queue_health_stats(
    p_tenant_id uuid DEFAULT NULL,
    p_start_date timestamptz DEFAULT NULL,
    p_end_date   timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start timestamptz;
    v_end   timestamptz;
    v_success_today   INT;
    v_failed_today    INT;
    v_wip_count       INT;
    v_latency         FLOAT;
    v_error_rate      FLOAT;
BEGIN
    -- Default window: last 24 hours
    v_start := COALESCE(p_start_date, NOW() - INTERVAL '24 hours');
    v_end   := COALESCE(p_end_date,   NOW());

    SELECT count(*) INTO v_success_today
    FROM public.inbound_queue
    WHERE status IN ('completed', 'done', 'processed')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
      AND created_at BETWEEN v_start AND v_end;

    SELECT count(*) INTO v_failed_today
    FROM public.inbound_queue_errors
    WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
      AND created_at BETWEEN v_start AND v_end;

    -- WIP is always live (not date-filtered)
    SELECT count(*) INTO v_wip_count
    FROM public.inbound_queue
    WHERE status IN ('pending', 'processing', 'queued')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

    SELECT COALESCE(AVG(EXTRACT(EPOCH FROM queue_time)), 0) INTO v_latency
    FROM public.inbound_queue
    WHERE status IN ('completed', 'done', 'processed')
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
      AND created_at BETWEEN v_start AND v_end;

    -- Error rate: failures / (failures + success)
    v_error_rate := CASE
        WHEN (v_failed_today + v_success_today) > 0
        THEN ROUND(((v_failed_today::float / (v_failed_today + v_success_today)) * 100)::numeric, 1)
        ELSE 0
    END;

    RETURN jsonb_build_object(
        'success_today',        v_success_today,
        'critical_failures',    v_failed_today,
        'pending_count',        v_wip_count,
        'avg_latency_seconds',  ROUND(v_latency::numeric, 2),
        'error_rate',           v_error_rate,
        'total_messages',       v_success_today + v_failed_today
    );
END;
$$;

-- 2. AUDIT QUEUE WITH DATE RANGE + SEARCH
DROP FUNCTION IF EXISTS public.fn_get_queue_audit(uuid, int);
CREATE OR REPLACE FUNCTION public.fn_get_queue_audit(
    p_tenant_id     uuid DEFAULT NULL,
    p_stuck_minutes int  DEFAULT 5,
    p_start_date    timestamptz DEFAULT NULL,
    p_end_date      timestamptz DEFAULT NULL,
    p_search_text   text DEFAULT NULL
)
RETURNS TABLE (
    out_id           uuid,
    out_status       text,
    out_created_at   timestamptz,
    out_error_message text,
    out_agent_name   text,
    out_tenant_name  text,
    out_message_type text,
    out_external_id  text,
    out_tenant_id    uuid,
    out_retry_count  int,
    out_payload      jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start timestamptz;
    v_end   timestamptz;
BEGIN
    v_start := COALESCE(p_start_date, NOW() - INTERVAL '7 days');
    v_end   := COALESCE(p_end_date,   NOW());

    RETURN QUERY
    SELECT * FROM (
        -- 1. Stuck / active queue items
        SELECT
            q.id as out_id,
            q.status::text as out_status,
            q.created_at as out_created_at,
            q.error_message::text as out_error_message,
            COALESCE(a.name, 'Agente Admin / API')::text as out_agent_name,
            COALESCE(c.name, 'SISTEMA DAVOS')::text as out_tenant_name,
            q.message_type::text as out_message_type,
            q.external_id::text as out_external_id,
            q.tenant_id as out_tenant_id,
            q.retry_count as out_retry_count,
            q.payload as out_payload
        FROM public.inbound_queue q
        LEFT JOIN public.agents a ON q.agent_id = a.id
        LEFT JOIN public.companies c ON q.tenant_id = c.id
        WHERE
            (p_tenant_id IS NULL OR q.tenant_id = p_tenant_id)
            AND (q.status IN ('pending', 'processing', 'queued') AND q.created_at < (NOW() - (p_stuck_minutes || ' minutes')::interval))
            -- Search filter
            AND (
                p_search_text IS NULL
                OR q.error_message ILIKE '%' || p_search_text || '%'
                OR a.name ILIKE '%' || p_search_text || '%'
                OR c.name ILIKE '%' || p_search_text || '%'
            )

        UNION ALL

        -- 2. Error history from dedicated error table
        SELECT
            qe.queue_id as out_id,
            qe.status::text as out_status,
            qe.created_at as out_created_at,
            qe.error_message::text as out_error_message,
            COALESCE(a.name, 'Agente Admin / API')::text as out_agent_name,
            COALESCE(c.name, 'SISTEMA DAVOS')::text as out_tenant_name,
            'log'::text as out_message_type,
            qe.external_id::text as out_external_id,
            qe.tenant_id as out_tenant_id,
            0 as out_retry_count,
            qe.payload as out_payload
        FROM public.inbound_queue_errors qe
        LEFT JOIN public.agents a ON qe.agent_id = a.id
        LEFT JOIN public.companies c ON qe.tenant_id = c.id
        WHERE
            (p_tenant_id IS NULL OR qe.tenant_id = p_tenant_id)
            AND qe.created_at BETWEEN v_start AND v_end
            -- Search filter
            AND (
                p_search_text IS NULL
                OR qe.error_message ILIKE '%' || p_search_text || '%'
                OR a.name ILIKE '%' || p_search_text || '%'
                OR c.name ILIKE '%' || p_search_text || '%'
            )
    ) as audit_combined
    ORDER BY out_created_at DESC
    LIMIT 200;
END;
$$;

-- 3. ROOT CAUSE ANALYSIS WITH DATE RANGE + SEARCH
CREATE OR REPLACE FUNCTION public.fn_get_error_root_causes(
    p_tenant_id   uuid DEFAULT NULL,
    p_start_date  timestamptz DEFAULT NULL,
    p_end_date    timestamptz DEFAULT NULL,
    p_search_text text DEFAULT NULL
)
RETURNS TABLE (
    error_type       text,
    root_cause       text,
    occurrence_count bigint,
    impact_level     text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start timestamptz;
    v_end   timestamptz;
BEGIN
    v_start := COALESCE(p_start_date, NOW() - INTERVAL '24 hours');
    v_end   := COALESCE(p_end_date,   NOW());

    RETURN QUERY
    SELECT
        COALESCE(error_message, 'ERRO DESCONHECIDO')::text as error_type,
        'TIMEOUT OU FALHA DE PROCESSAMENTO'::text as root_cause,
        count(*)::bigint as occurrence_count,
        CASE
            WHEN count(*) > 5 THEN 'CRÍTICO'
            WHEN count(*) > 2 THEN 'ALTO'
            ELSE 'MÉDIO'
        END::text as impact_level
    FROM public.inbound_queue_errors
    WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
      AND created_at BETWEEN v_start AND v_end
      AND (
          p_search_text IS NULL
          OR error_message ILIKE '%' || p_search_text || '%'
      )
    GROUP BY error_message
    ORDER BY count(*) DESC;
END;
$$;
