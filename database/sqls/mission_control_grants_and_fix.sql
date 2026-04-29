-- ================================================================= --
-- DAVOS NEXUS - MISSION CONTROL FIX                                  --
-- Execute este script no Supabase SQL Editor para corrigir os 3      --
-- erros de console (404 + 400) da tela de Mission Control.           --
-- ================================================================= --

-- ─────────────────────────────────────────────────────────────────── --
-- PASSO 0: CORRIGIR fn_get_mission_control_v2                        --
-- A versão anterior usava "updated_at" que não existe na tabela.     --
-- A coluna correta para latência é "queue_time" (tipo interval).     --
-- Também adicionado guard para p_tenant_id IS NULL (visão global).   --
-- ─────────────────────────────────────────────────────────────────── --
CREATE OR REPLACE FUNCTION public.fn_get_mission_control_v2(
    p_tenant_id  uuid DEFAULT NULL,
    p_period     text DEFAULT 'today',
    p_search     text DEFAULT NULL,
    p_start_date timestamptz DEFAULT NULL,
    p_end_date   timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start  timestamptz;
    v_end    timestamptz := now();
    v_metrics jsonb;
    v_errors  jsonb;
BEGIN
    -- 1. Período dinâmico (regra no banco)
    CASE p_period
        WHEN 'today'     THEN v_start := date_trunc('day', now());
        WHEN 'yesterday' THEN
            v_start := date_trunc('day', now()) - interval '1 day';
            v_end   := date_trunc('day', now());
        WHEN 'week'      THEN v_start := date_trunc('week', now());
        WHEN 'month'     THEN v_start := date_trunc('month', now());
        WHEN 'custom'    THEN
            v_start := COALESCE(p_start_date, date_trunc('day', now()));
            v_end   := COALESCE(p_end_date,   now());
        ELSE                  v_start := date_trunc('day', now());
    END CASE;

    -- 2. Métricas do período
    SELECT jsonb_build_object(
        -- Sucessos no período
        'success', (
            SELECT count(*) FROM inbound_queue
            WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
              AND status IN ('done', 'completed', 'processed')
              AND created_at BETWEEN v_start AND v_end
        ),
        -- Falhas críticas no período
        'critical', (
            SELECT count(*) FROM inbound_queue_errors
            WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
              AND created_at BETWEEN v_start AND v_end
        ),
        -- WIP: sempre ao vivo, sem filtro de data
        'pending', (
            SELECT count(*) FROM inbound_queue
            WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
              AND status IN ('pending', 'processing', 'queued')
        ),
        -- Latência média usando queue_time (interval) em vez de updated_at
        'avg_latency', (
            SELECT COALESCE(avg(extract(epoch FROM queue_time)), 0)
            FROM inbound_queue
            WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
              AND status IN ('done', 'completed', 'processed')
              AND created_at BETWEEN v_start AND v_end
        ),
        -- Rejeições por regra de negócio (sempre em inbound_queue, status = 'rejected')
        'rejected', (
            SELECT count(*) FROM inbound_queue
            WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
              AND status = 'rejected'
              AND created_at BETWEEN v_start AND v_end
        )
    ) INTO v_metrics;

    -- 3. Lista de erros com busca
    SELECT COALESCE(jsonb_agg(e ORDER BY e->>'created_at' DESC), '[]'::jsonb) INTO v_errors
    FROM (
        SELECT jsonb_build_object(
            'created_at',        qe.created_at,
            'error_message',     qe.error_message,
            'trace_id',          qe.trace_id,
            'external_id',       qe.external_id,
            'agent_name',        a.name
        ) AS e
        FROM inbound_queue_errors qe
        LEFT JOIN agents a ON a.id = qe.agent_id
        WHERE (p_tenant_id IS NULL OR qe.tenant_id = p_tenant_id)
          AND qe.created_at BETWEEN v_start AND v_end
          AND (
              p_search IS NULL
              OR qe.error_message   ILIKE '%' || p_search || '%'
              OR qe.trace_id        ILIKE '%' || p_search || '%'
          )
        ORDER BY qe.created_at DESC
        LIMIT 50
    ) sub;

    RETURN jsonb_build_object(
        'metrics',     v_metrics,
        'errors',      v_errors,
        'period_info', jsonb_build_object('start', v_start, 'end', v_end)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_mission_control_v2(uuid, text, text, timestamptz, timestamptz)
    TO authenticated, anon, service_role;


DROP FUNCTION IF EXISTS public.fn_get_queue_audit(uuid, int);
DROP FUNCTION IF EXISTS public.fn_get_queue_audit(uuid, int, timestamptz, timestamptz, text);

CREATE OR REPLACE FUNCTION public.fn_get_queue_audit(
    p_tenant_id     uuid DEFAULT NULL,
    p_stuck_minutes int  DEFAULT 5,
    p_start_date    timestamptz DEFAULT NULL,
    p_end_date      timestamptz DEFAULT NULL,
    p_search_text   text DEFAULT NULL
)
RETURNS TABLE (
    out_id            uuid,
    out_status        text,
    out_created_at    timestamptz,
    out_error_message text,
    out_agent_name    text,
    out_tenant_name   text,
    out_message_type  text,
    out_external_id   text,
    out_tenant_id     uuid,
    out_retry_count   int,
    out_payload       jsonb
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
        -- 1. Stuck / processing queue items
        SELECT
            q.id                                         AS out_id,
            q.status::text                               AS out_status,
            q.created_at                                 AS out_created_at,
            q.error_message::text                        AS out_error_message,
            COALESCE(a.name, 'Agente Admin / API')::text AS out_agent_name,
            COALESCE(c.name, 'SISTEMA DAVOS')::text      AS out_tenant_name,
            q.message_type::text                         AS out_message_type,
            q.external_id::text                          AS out_external_id,
            q.tenant_id                                  AS out_tenant_id,
            q.retry_count                                AS out_retry_count,
            q.payload                                    AS out_payload
        FROM public.inbound_queue q
        LEFT JOIN public.agents   a ON q.agent_id  = a.id
        LEFT JOIN public.companies c ON q.tenant_id = c.id
        WHERE
            (p_tenant_id IS NULL OR q.tenant_id = p_tenant_id)
            AND q.status IN ('pending', 'processing', 'queued')
            AND q.created_at BETWEEN v_start AND v_end
            AND q.created_at < (NOW() - (p_stuck_minutes || ' minutes')::interval)
            AND (
                p_search_text IS NULL
                OR q.error_message ILIKE '%' || p_search_text || '%'
                OR a.name         ILIKE '%' || p_search_text || '%'
                OR c.name         ILIKE '%' || p_search_text || '%'
            )

        UNION ALL

        -- 2. Error log
        SELECT
            qe.queue_id                                  AS out_id,
            qe.status::text                              AS out_status,
            qe.created_at                                AS out_created_at,
            qe.error_message::text                       AS out_error_message,
            COALESCE(a.name, 'Agente Admin / API')::text AS out_agent_name,
            COALESCE(c.name, 'SISTEMA DAVOS')::text      AS out_tenant_name,
            'log'::text                                  AS out_message_type,
            qe.external_id::text                         AS out_external_id,
            qe.tenant_id                                 AS out_tenant_id,
            0                                            AS out_retry_count,
            qe.payload                                   AS out_payload
        FROM public.inbound_queue_errors qe
        LEFT JOIN public.agents   a ON qe.agent_id  = a.id
        LEFT JOIN public.companies c ON qe.tenant_id = c.id
        WHERE
            (p_tenant_id IS NULL OR qe.tenant_id = p_tenant_id)
            AND qe.created_at BETWEEN v_start AND v_end
            AND (
                p_search_text IS NULL
                OR qe.error_message ILIKE '%' || p_search_text || '%'
                OR a.name           ILIKE '%' || p_search_text || '%'
                OR c.name           ILIKE '%' || p_search_text || '%'
            )
    ) AS audit_combined
    ORDER BY out_created_at DESC
    LIMIT 200;
END;
$$;

-- ─────────────────────────────────────────────────────────────────── --
-- PASSO 2: Atualizar fn_get_error_root_causes com suporte a filtros  --
-- (corrige o 404 - a versão antiga não tem os novos parâmetros)      --
-- ─────────────────────────────────────────────────────────────────── --
DROP FUNCTION IF EXISTS public.fn_get_error_root_causes(uuid);
DROP FUNCTION IF EXISTS public.fn_get_error_root_causes(uuid, timestamptz, timestamptz, text);

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
        COALESCE(error_message, 'ERRO DESCONHECIDO')::text        AS error_type,
        'TIMEOUT OU FALHA DE PROCESSAMENTO'::text                 AS root_cause,
        count(*)::bigint                                          AS occurrence_count,
        CASE
            WHEN count(*) > 5 THEN 'CRÍTICO'
            WHEN count(*) > 2 THEN 'ALTO'
            ELSE 'MÉDIO'
        END::text                                                 AS impact_level
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

-- ─────────────────────────────────────────────────────────────────── --
-- PASSO 3: GRANT EXECUTE para todas as funções do Mission Control    --
-- (corrige o 400 em fn_get_mission_control_v2)                       --
-- ─────────────────────────────────────────────────────────────────── --
GRANT EXECUTE ON FUNCTION public.fn_get_mission_control_v2(uuid, text, text, timestamptz, timestamptz)
    TO authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION public.fn_get_queue_audit(uuid, int, timestamptz, timestamptz, text)
    TO authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION public.fn_get_error_root_causes(uuid, timestamptz, timestamptz, text)
    TO authenticated, anon, service_role;

-- Se ainda possuir a versão antiga do health stats, garanta acesso também:
GRANT EXECUTE ON FUNCTION public.fn_get_queue_health_stats(uuid, timestamptz, timestamptz)
    TO authenticated, anon, service_role;
