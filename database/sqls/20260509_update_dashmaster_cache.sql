-- Migração: DashMaster Cache Implementation (V66.11)
-- Objetivo: Reduzir latência do Dashboard de ~2s para <10ms usando Cache-Aside pattern.

CREATE OR REPLACE FUNCTION public.get_dashmaster_v1(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cache_record RECORD;
    v_final_json JSONB;
    v_start_date DATE := (CURRENT_DATE - INTERVAL '30 days')::DATE;
    v_usage JSONB;
    v_financials JSONB;
    v_plan JSONB;
    v_incidents JSONB;
    v_contacts JSONB;
    v_charts JSONB;
    v_agents JSONB;
    v_summary JSONB;
BEGIN
    -- [1] Tenta recuperar do cache (TTL de 30 segundos)
    SELECT * INTO v_cache_record FROM public.dash_cache 
    WHERE tenant_id = p_tenant_id AND updated_at > (NOW() - INTERVAL '30 seconds');

    IF v_cache_record.payload IS NOT NULL THEN
        RETURN v_cache_record.payload || jsonb_build_object('cache_hit', TRUE, 'cached_at', v_cache_record.updated_at);
    END IF;

    -- [2] Se não houver cache, executa a consulta pesada (Original)
    
    -- Usage Stats (30d)
    SELECT jsonb_build_object(
        'total_tokens', COALESCE(SUM(value) FILTER (WHERE metric_type = 'tokens'), 0),
        'total_messages', COALESCE(SUM(value) FILTER (WHERE metric_type = 'messages'), 0),
        'total_stt', COALESCE(SUM(value) FILTER (WHERE metric_type = 'stt_minutes'), 0),
        'total_tts', COALESCE(SUM(value) FILTER (WHERE metric_type = 'tts_minutes'), 0)
    ) INTO v_usage
    FROM public.consumption_metrics 
    WHERE tenant_id = p_tenant_id AND created_at >= v_start_date;

    -- Financials & Plan
    SELECT jsonb_build_object(
        'plan_name', p.id,
        'base_price', p.base_price,
        'status', c.status
    ) INTO v_plan
    FROM public.companies c
    JOIN public.plans p ON c.plan_tier = p.id
    WHERE c.id = p_tenant_id;

    -- Active Incidents
    SELECT COALESCE(jsonb_agg(inc), '[]'::jsonb) INTO v_incidents
    FROM (SELECT id, title, severity, status FROM public.system_incidents WHERE tenant_id = p_tenant_id AND status = 'active') inc;

    -- Agents Summary
    SELECT COALESCE(jsonb_agg(ag), '[]'::jsonb) INTO v_agents
    FROM (
        SELECT a.id, a.name, a.status, a.role,
               (SELECT COUNT(*) FROM public.conversations c WHERE c.agent_id = a.id AND c.status = 'ai_active') as active_convs
        FROM public.agents a 
        WHERE a.tenant_id = p_tenant_id
    ) ag;

    -- Montagem do JSON Final
    v_final_json := jsonb_build_object(
        'usage', v_usage,
        'plan', v_plan,
        'incidents', v_incidents,
        'agents', v_agents,
        'summary', jsonb_build_object(
            'updated_at', NOW(),
            'period_days', 30
        )
    );

    -- [3] Salva no Cache para as próximas chamadas
    INSERT INTO public.dash_cache (tenant_id, payload, updated_at)
    VALUES (p_tenant_id, v_final_json, NOW())
    ON CONFLICT (tenant_id) DO UPDATE 
    SET payload = EXCLUDED.payload, updated_at = NOW();

    RETURN v_final_json || jsonb_build_object('cache_hit', FALSE);
END;
$$;
