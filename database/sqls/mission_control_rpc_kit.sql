-- =============================================== --
-- DAVOS NEXUS - MISSION CONTROL V7 (ULTIMATE FIX) --
-- =============================================== --

DROP FUNCTION IF EXISTS public.fn_get_queue_audit(uuid,int);
DROP FUNCTION IF EXISTS public.fn_get_queue_health_stats(uuid);
DROP FUNCTION IF EXISTS public.fn_get_error_root_causes(uuid);

-- 1. HEALTH STATS (CARDS)
CREATE OR REPLACE FUNCTION public.fn_get_queue_health_stats(
    p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_success_today INT;
    v_failed_today INT;
    v_wip_count INT;
    v_latency FLOAT;
BEGIN
    SELECT count(*) INTO v_success_today 
    FROM public.inbound_queue 
    WHERE status IN ('completed', 'done', 'processed') 
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id) 
      AND created_at >= NOW() - INTERVAL '24 hours';

    SELECT count(*) INTO v_failed_today 
    FROM public.inbound_queue_errors 
    WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id) 
      AND created_at >= NOW() - INTERVAL '24 hours';

    SELECT count(*) INTO v_wip_count 
    FROM public.inbound_queue 
    WHERE status IN ('pending', 'processing', 'queued') 
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

    SELECT COALESCE(AVG(EXTRACT(EPOCH FROM queue_time)), 0) INTO v_latency 
    FROM public.inbound_queue 
    WHERE status IN ('completed', 'done', 'processed') 
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id) 
      AND created_at >= NOW() - INTERVAL '24 hours';

    RETURN jsonb_build_object(
        'success_today', v_success_today,
        'critical_failures', v_failed_today,
        'pending_count', v_wip_count,
        'avg_latency_seconds', ROUND(v_latency::numeric, 2)
    );
END;
$$;

-- 2. AUDIT QUEUE (TABLE)
CREATE OR REPLACE FUNCTION public.fn_get_queue_audit(
    p_tenant_id uuid DEFAULT NULL,
    p_stuck_minutes int DEFAULT 5
)
RETURNS TABLE (
    out_id uuid,
    out_status text,
    out_created_at timestamptz,
    out_error_message text,
    out_agent_name text,
    out_tenant_name text,
    out_message_type text,
    out_external_id text,
    out_tenant_id uuid,
    out_retry_count int,
    out_payload jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM (
        -- 1. Stuck items from main queue
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
            AND 
            (q.status IN ('pending', 'processing', 'queued') AND q.created_at < (NOW() - (p_stuck_minutes || ' minutes')::interval))
            
        UNION ALL
        
        -- 2. Audit history from our new dedicated error table
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
    ) as audit_combined
    ORDER BY out_created_at DESC
    LIMIT 100;
END;
$$;

-- 3. CAUSA RAIZ (RCA)
CREATE OR REPLACE FUNCTION public.fn_get_error_root_causes(
    p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
    error_type text,
    root_cause text,
    occurrence_count bigint,
    impact_level text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
      AND created_at >= NOW() - INTERVAL '24 hours'
    GROUP BY error_message
    ORDER BY count(*) DESC;
END;
$$;

-- 4. REPROCESSAMENTO (RETRY)
CREATE OR REPLACE FUNCTION public.fn_retry_failed_message(
    p_queue_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.inbound_queue SET status = 'pending', retry_count = retry_count + 1, processed_at = NULL, error_message = NULL WHERE id = p_queue_id;
END;
$$;
