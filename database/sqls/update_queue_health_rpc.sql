
-- =============================================== --
-- DAVOS NEXUS - MONITOR DE FILA V7 (ELITE FIX) --
-- Corrige a contagem de WIP e Latência --
-- =============================================== --

CREATE OR REPLACE FUNCTION public.fn_get_queue_health_stats(
    p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_success_today INT;
    v_failed_today INT;
    v_wip_count INT;
    v_avg_latency FLOAT;
BEGIN
    -- 1. Sucessos de Hoje (Processadas com sucesso nas últimas 24h)
    SELECT count(*) INTO v_success_today
    FROM public.inbound_queue
    WHERE status = 'done'
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    AND created_at >= NOW() - INTERVAL '24 hours';

    -- 2. Falhas Críticas (Marcadas como erro)
    -- NOTA: Aqui contamos apenas as que explicitamente falharam
    SELECT count(*) INTO v_failed_today
    FROM public.inbound_queue
    WHERE status = 'failed'
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    AND created_at >= NOW() - INTERVAL '24 hours';

    -- 3. Na Fila / WIP (Tudo que ainda não terminou)
    -- Pendentes + Processando = WIP real
    SELECT count(*) INTO v_wip_count
    FROM public.inbound_queue
    WHERE status IN ('pending', 'processing')
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

    -- 4. Latência Média (Tempo de espera na fila com sucesso)
    -- Calculado em segundos
    SELECT COALESCE(AVG(EXTRACT(EPOCH FROM queue_time)), 0) INTO v_avg_latency
    FROM public.inbound_queue
    WHERE status = 'done'
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    AND created_at >= NOW() - INTERVAL '24 hours';

    RETURN jsonb_build_object(
        'success_today', v_success_today,
        'critical_failures', v_failed_today,
        'pending_count', v_wip_count,
        'avg_latency_seconds', ROUND(v_avg_latency::numeric, 2)
    );
END;
$$;
