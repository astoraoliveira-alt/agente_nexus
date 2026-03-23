-- ================================================================= --
-- DAVOS NEXUS - AI PERFORMANCE CENTER RPCs                          --
-- Execute este script no Supabase SQL Editor                        --
-- Gera as 4 funções para as abas do Centro de Performance de IA    --
-- ================================================================= --

-- ─────────────────────────────────────────────────────────────────── --
-- ABA 1: ECONOMIA & ROI                                              --
-- Fonte: consumption_metrics, conversations, companies               --
-- ─────────────────────────────────────────────────────────────────── --
CREATE OR REPLACE FUNCTION public.fn_ai_perf_economics(
    p_tenant_id  uuid        DEFAULT NULL,
    p_start_date timestamptz DEFAULT NULL,
    p_end_date   timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start      timestamptz := COALESCE(p_start_date, date_trunc('day', now()));
    v_end        timestamptz := COALESCE(p_end_date,   now());
    v_summary    jsonb;
    v_by_type    jsonb;
    v_by_agent   jsonb;
    v_top_costly jsonb;
BEGIN
    -- Sumário total de custo e volume
    SELECT jsonb_build_object(
        'total_cost',     COALESCE(SUM(cm.cost)::numeric(12,4), 0),
        'total_tokens',   COALESCE(SUM(CASE WHEN cm.metric_type = 'tokens' THEN cm.value ELSE 0 END)::bigint, 0),
        'total_messages', COALESCE(SUM(CASE WHEN cm.metric_type = 'messages' THEN cm.value ELSE 0 END)::bigint, 0),
        'total_stt_min',  COALESCE(SUM(CASE WHEN cm.metric_type = 'stt_minutes' THEN cm.value ELSE 0 END)::numeric(10,2), 0),
        'total_tts_min',  COALESCE(SUM(CASE WHEN cm.metric_type = 'tts_minutes' THEN cm.value ELSE 0 END)::numeric(10,2), 0),
        'avg_cost_per_msg', COALESCE(
            SUM(cm.cost) / NULLIF(SUM(CASE WHEN cm.metric_type = 'messages' THEN cm.value ELSE 0 END), 0),
            0
        )::numeric(10,4)
    ) INTO v_summary
    FROM consumption_metrics cm
    WHERE (p_tenant_id IS NULL OR cm.tenant_id = p_tenant_id)
      AND cm.recorded_at BETWEEN v_start AND v_end;

    -- Custo por tipo de métrica
    SELECT COALESCE(jsonb_agg(t ORDER BY t->>'total_cost' DESC), '[]'::jsonb) INTO v_by_type
    FROM (
        SELECT jsonb_build_object(
            'metric_type', cm.metric_type,
            'total_cost',  ROUND(SUM(cm.cost)::numeric, 4),
            'total_value', SUM(cm.value)::bigint
        ) AS t
        FROM consumption_metrics cm
        WHERE (p_tenant_id IS NULL OR cm.tenant_id = p_tenant_id)
          AND cm.recorded_at BETWEEN v_start AND v_end
        GROUP BY cm.metric_type
    ) sub;

    -- Custo por agente (top 10)
    SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'total_cost')::numeric DESC), '[]'::jsonb) INTO v_by_agent
    FROM (
        SELECT jsonb_build_object(
            'agent_id',   cm.agent_id,
            'agent_name', COALESCE(a.name, 'Agente Removido'),
            'total_cost', ROUND(SUM(cm.cost)::numeric, 4),
            'total_msgs', SUM(CASE WHEN cm.metric_type = 'messages' THEN cm.value ELSE 0 END)::bigint
        ) AS t
        FROM consumption_metrics cm
        LEFT JOIN agents a ON a.id = cm.agent_id
        WHERE (p_tenant_id IS NULL OR cm.tenant_id = p_tenant_id)
          AND cm.recorded_at BETWEEN v_start AND v_end
        GROUP BY cm.agent_id, a.name
        ORDER BY SUM(cm.cost) DESC
        LIMIT 10
    ) sub;

    -- ROI estimation via conversations
    SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'total_conversations')::int DESC), '[]'::jsonb) INTO v_top_costly
    FROM (
        SELECT jsonb_build_object(
            'channel',             c.channel,
            'total_conversations', COUNT(c.id)::int,
            'completed',           COUNT(c.id) FILTER (WHERE c.status = 'closed')::int
        ) AS t
        FROM conversations c
        WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
          AND c.created_at BETWEEN v_start AND v_end
        GROUP BY c.channel
        ORDER BY COUNT(c.id) DESC
    ) sub;

    RETURN jsonb_build_object(
        'summary',      v_summary,
        'by_type',      v_by_type,
        'by_agent',     v_by_agent,
        'by_channel',   v_top_costly
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_ai_perf_economics(uuid, timestamptz, timestamptz)
    TO authenticated, anon, service_role;


-- ─────────────────────────────────────────────────────────────────── --
-- ABA 2: SEGURANÇA & COMPLIANCE                                      --
-- Fonte: audit_logs, conversations, inbound_queue_errors, contacts   --
-- ─────────────────────────────────────────────────────────────────── --
CREATE OR REPLACE FUNCTION public.fn_ai_perf_security(
    p_tenant_id  uuid        DEFAULT NULL,
    p_start_date timestamptz DEFAULT NULL,
    p_end_date   timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start       timestamptz := COALESCE(p_start_date, date_trunc('day', now()));
    v_end         timestamptz := COALESCE(p_end_date, now());
    v_audit_stats jsonb;
    v_recent_logs jsonb;
    v_error_stats jsonb;
    v_contact_bans jsonb;
BEGIN
    -- Estatísticas de auditoria por ação
    SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'count')::int DESC), '[]'::jsonb) INTO v_audit_stats
    FROM (
        SELECT jsonb_build_object(
            'action', al.action,
            'count',  COUNT(*)::int,
            'actors', COUNT(DISTINCT al.actor_id)::int
        ) AS t
        FROM audit_logs al
        WHERE (p_tenant_id IS NULL OR al.tenant_id = p_tenant_id)
          AND al.created_at BETWEEN v_start AND v_end
        GROUP BY al.action
        ORDER BY COUNT(*) DESC
        LIMIT 20
    ) sub;

    -- Últimos 15 eventos de auditoria
    SELECT COALESCE(jsonb_agg(t ORDER BY t->>'created_at' DESC), '[]'::jsonb) INTO v_recent_logs
    FROM (
        SELECT jsonb_build_object(
            'id',         al.id,
            'action',     al.action,
            'actor_name', al.actor_name,
            'target_type',al.target_type,
            'details',    al.details,
            'created_at', al.created_at
        ) AS t
        FROM audit_logs al
        WHERE (p_tenant_id IS NULL OR al.tenant_id = p_tenant_id)
          AND al.created_at BETWEEN v_start AND v_end
        ORDER BY al.created_at DESC
        LIMIT 15
    ) sub;

    -- Erros por tipo (top causas)
    SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'count')::int DESC), '[]'::jsonb) INTO v_error_stats
    FROM (
        SELECT jsonb_build_object(
            'error_type', COALESCE(qe.error_message, 'Erro Desconhecido'),
            'count',      COUNT(*)::int,
            'impact',     CASE
                              WHEN COUNT(*) > 5 THEN 'CRÍTICO'
                              WHEN COUNT(*) > 2 THEN 'ALTO'
                              ELSE 'MÉDIO'
                          END
        ) AS t
        FROM inbound_queue_errors qe
        WHERE (p_tenant_id IS NULL OR qe.tenant_id = p_tenant_id)
          AND qe.created_at BETWEEN v_start AND v_end
        GROUP BY qe.error_message
        ORDER BY COUNT(*) DESC
        LIMIT 10
    ) sub;

    -- Contatos banidos
    SELECT jsonb_build_object(
        'total_banned',   COUNT(*) FILTER (WHERE c.status = 'banned')::int,
        'total_blocked',  COUNT(*) FILTER (WHERE c.status = 'blocked')::int,
        'total_contacts', COUNT(*)::int
    ) INTO v_contact_bans
    FROM contacts c
    WHERE (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id);

    RETURN jsonb_build_object(
        'audit_stats',   v_audit_stats,
        'recent_logs',   v_recent_logs,
        'error_stats',   v_error_stats,
        'contact_bans',  v_contact_bans
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_ai_perf_security(uuid, timestamptz, timestamptz)
    TO authenticated, anon, service_role;


-- ─────────────────────────────────────────────────────────────────── --
-- ABA 3: OTIMIZAÇÃO DE IA                                            --
-- Fonte: consumption_metrics, inbound_queue, inbound_queue_errors    --
-- ─────────────────────────────────────────────────────────────────── --
CREATE OR REPLACE FUNCTION public.fn_ai_perf_optimization(
    p_tenant_id  uuid        DEFAULT NULL,
    p_start_date timestamptz DEFAULT NULL,
    p_end_date   timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start       timestamptz := COALESCE(p_start_date, date_trunc('day', now()));
    v_end         timestamptz := COALESCE(p_end_date, now());
    v_token_stats jsonb;
    v_latency     jsonb;
    v_error_rate  jsonb;
    v_insights    jsonb;
    v_channel_mix jsonb;
BEGIN
    -- Estatísticas de tokens por agente
    SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'total_tokens')::bigint DESC), '[]'::jsonb) INTO v_token_stats
    FROM (
        SELECT jsonb_build_object(
            'agent_id',     cm.agent_id,
            'agent_name',   COALESCE(a.name, 'Agente Removido'),
            'total_tokens', COALESCE(SUM(cm.value), 0)::bigint,
            'total_cost',   ROUND(COALESCE(SUM(cm.cost), 0)::numeric, 4)
        ) AS t
        FROM consumption_metrics cm
        LEFT JOIN agents a ON a.id = cm.agent_id
        WHERE (p_tenant_id IS NULL OR cm.tenant_id = p_tenant_id)
          AND cm.recorded_at BETWEEN v_start AND v_end
          AND cm.metric_type = 'tokens'
        GROUP BY cm.agent_id, a.name
        ORDER BY SUM(cm.value) DESC
        LIMIT 10
    ) sub;

    -- Latência por status (inbound_queue)
    SELECT jsonb_build_object(
        'avg_latency_sec', COALESCE(
            AVG(EXTRACT(EPOCH FROM queue_time)) FILTER (WHERE status IN ('done','completed','processed')),
            0
        )::numeric(10,2),
        'p95_latency_sec', COALESCE(
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM queue_time))
            FILTER (WHERE status IN ('done','completed','processed')),
            0
        )::numeric(10,2),
        'total_processed', COUNT(*) FILTER (WHERE status IN ('done','completed','processed'))::int,
        'total_errors',    COUNT(*) FILTER (WHERE status IN ('error','failed'))::int
    ) INTO v_latency
    FROM inbound_queue
    WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
      AND created_at BETWEEN v_start AND v_end;

    -- Taxa de erro por agente
    SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'error_rate')::numeric DESC), '[]'::jsonb) INTO v_error_rate
    FROM (
        SELECT jsonb_build_object(
            'agent_id',   q.agent_id,
            'agent_name', COALESCE(a.name, 'Agente Removido'),
            'total',      COUNT(q.id)::int,
            'errors',     COUNT(q.id) FILTER (WHERE q.status IN ('error','failed'))::int,
            'error_rate', ROUND(
                100.0 * COUNT(q.id) FILTER (WHERE q.status IN ('error','failed')) /
                NULLIF(COUNT(q.id), 0),
                1
            )::numeric
        ) AS t
        FROM inbound_queue q
        LEFT JOIN agents a ON a.id = q.agent_id
        WHERE (p_tenant_id IS NULL OR q.tenant_id = p_tenant_id)
          AND q.created_at BETWEEN v_start AND v_end
        GROUP BY q.agent_id, a.name
        HAVING COUNT(q.id) > 0
        ORDER BY (100.0 * COUNT(q.id) FILTER (WHERE q.status IN ('error','failed')) / NULLIF(COUNT(q.id),0)) DESC
        LIMIT 10
    ) sub;

    -- Mix por canal (via consumption_metrics que possui campo channel)
    SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'count')::int DESC), '[]'::jsonb) INTO v_channel_mix
    FROM (
        SELECT jsonb_build_object(
            'channel', COALESCE(cm.channel::text, 'desconhecido'),
            'count',   COUNT(*)::int,
            'cost',    ROUND(COALESCE(SUM(cm.cost), 0)::numeric, 4)
        ) AS t
        FROM consumption_metrics cm
        WHERE (p_tenant_id IS NULL OR cm.tenant_id = p_tenant_id)
          AND cm.recorded_at BETWEEN v_start AND v_end
        GROUP BY cm.channel
    ) sub;

    -- Insights automáticos (regras simples)
    WITH stats AS (
        SELECT
            COUNT(*) FILTER (WHERE status IN ('error','failed')) AS errors,
            COUNT(*) FILTER (WHERE status IN ('done','completed','processed')) AS success,
            COUNT(*) FILTER (WHERE status IN ('pending','processing','queued')
                             AND created_at < NOW() - INTERVAL '10 minutes') AS stuck,
            COUNT(*) AS total
        FROM inbound_queue
        WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
          AND created_at BETWEEN v_start AND v_end
    )
    SELECT jsonb_build_object(
        'has_high_error_rate',  (errors::numeric / NULLIF(total,0) * 100) > 10,
        'has_stuck_items',      stuck > 0,
        'stuck_count',          stuck,
        'error_count',          errors,
        'success_count',        success,
        'error_rate_pct',       ROUND((errors::numeric / NULLIF(total,0) * 100)::numeric, 1)
    ) INTO v_insights
    FROM stats;

    RETURN jsonb_build_object(
        'token_stats',  v_token_stats,
        'latency',      v_latency,
        'error_rate',   v_error_rate,
        'channel_mix',  v_channel_mix,
        'insights',     v_insights
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_ai_perf_optimization(uuid, timestamptz, timestamptz)
    TO authenticated, anon, service_role;


-- ─────────────────────────────────────────────────────────────────── --
-- ABA 4: CONHECIMENTO RAG                                            --
-- Fonte: agent_knowledge, conversations, messages                    --
-- ─────────────────────────────────────────────────────────────────── --
CREATE OR REPLACE FUNCTION public.fn_ai_perf_knowledge(
    p_tenant_id  uuid        DEFAULT NULL,
    p_start_date timestamptz DEFAULT NULL,
    p_end_date   timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start    timestamptz := COALESCE(p_start_date, date_trunc('day', now()));
    v_end      timestamptz := COALESCE(p_end_date, now());
    v_docs     jsonb;
    v_summary  jsonb;
BEGIN
    -- Documentos por agente (todos os documentos de conhecimento disponíveis)
    SELECT COALESCE(jsonb_agg(t ORDER BY t->>'name'), '[]'::jsonb) INTO v_docs
    FROM (
        SELECT jsonb_build_object(
            'id',         ak.id,
            'name',       ak.name,
            'file_type',  ak.file_type,
            'file_size',  ak.file_size,
            'agent_id',   ak.agent_id,
            'agent_name', COALESCE(a.name, 'Agente Removido'),
            'created_at', ak.created_at
        ) AS t
        FROM agent_knowledge ak
        LEFT JOIN agents a ON a.id = ak.agent_id
        WHERE (p_tenant_id IS NULL OR ak.tenant_id = p_tenant_id)
        ORDER BY ak.created_at DESC
        LIMIT 50
    ) sub;

    -- Resumo geral da base de conhecimento
    -- (tipos por contagem em subquery para evitar aggregate aninhado)
    WITH type_counts AS (
        SELECT COALESCE(file_type, 'text') AS ft, COUNT(id)::int AS cnt
        FROM agent_knowledge
        WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
        GROUP BY file_type
    ),
    types_agg AS (
        SELECT COALESCE(jsonb_object_agg(ft, cnt), '{}'::jsonb) AS types_json
        FROM type_counts
    )
    SELECT jsonb_build_object(
        'total_docs',        COUNT(ak.id)::int,
        'total_agents',      COUNT(DISTINCT ak.agent_id)::int,
        'total_size_bytes',  COALESCE(SUM(ak.file_size), 0)::bigint,
        'types',             (SELECT types_json FROM types_agg)
    ) INTO v_summary
    FROM agent_knowledge ak
    WHERE (p_tenant_id IS NULL OR ak.tenant_id = p_tenant_id);

    RETURN jsonb_build_object(
        'docs',     v_docs,
        'summary',  v_summary
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_ai_perf_knowledge(uuid, timestamptz, timestamptz)
    TO authenticated, anon, service_role;
