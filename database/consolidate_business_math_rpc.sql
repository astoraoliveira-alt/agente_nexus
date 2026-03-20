-- =============================================
-- CONSOLIDATE BUSINESS MATH (V2)
-- Centralizing Calculations in Database to avoid 401 Edge Function Errors
-- =============================================

-- 1. Enhanced get_agent_usage_stats (calculating internal operational costs)
CREATE OR REPLACE FUNCTION get_agent_usage_stats(p_tenant_id UUID)
RETURNS TABLE (
    agent_id UUID,
    total_tokens NUMERIC,
    total_messages NUMERIC,
    total_stt NUMERIC,
    total_tts NUMERIC,
    recorded_cost NUMERIC,
    total_conversations NUMERIC,
    active_conversations NUMERIC,
    internal_operational_cost NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_llm_rate NUMERIC := 0.04; -- Default Davos LLM cost per 1k tokens
    v_msg_rate NUMERIC := 0.01; -- Default Davos msg cost per message
    v_voice_rate NUMERIC := 0.15; -- Default Davos voice rate (STT/TTS combine)
    v_twilio_rate NUMERIC := 0.05; -- Default Twilio variable fee
BEGIN
    -- Optional: Load real rates from company_davos_costs if they exist
    BEGIN
        SELECT cost_value INTO v_llm_rate FROM company_davos_costs WHERE tenant_id = p_tenant_id AND item_key = 'llm_internal_rate';
        EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        SELECT cost_value INTO v_msg_rate FROM company_davos_costs WHERE tenant_id = p_tenant_id AND item_key = 'msg_whatsapp';
        EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        SELECT cost_value INTO v_voice_rate FROM company_davos_costs WHERE tenant_id = p_tenant_id AND item_key = 'voice_internal_rate';
        EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        SELECT cost_value INTO v_twilio_rate FROM company_davos_costs WHERE tenant_id = p_tenant_id AND item_key = 'twilio_variable';
        EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN QUERY
    WITH metrics_agg AS (
        SELECT 
            cm.agent_id,
            SUM(CASE WHEN cm.metric_type = 'tokens' THEN cm.value ELSE 0 END) as tokens,
            SUM(CASE WHEN cm.metric_type = 'messages' THEN cm.value ELSE 0 END) as msgs_recorded,
            SUM(CASE WHEN cm.metric_type = 'stt_minutes' THEN cm.value ELSE 0 END) as stt,
            SUM(CASE WHEN cm.metric_type = 'tts_minutes' THEN cm.value ELSE 0 END) as tts,
            SUM(cm.cost) as cost
        FROM consumption_metrics cm
        WHERE cm.tenant_id = p_tenant_id
        GROUP BY cm.agent_id
    ),
    msg_counts AS (
        SELECT 
            c.agent_id,
            COUNT(m.id) as msgs_synthetic
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        WHERE c.tenant_id = p_tenant_id
        GROUP BY c.agent_id
    ),
    conv_agg AS (
        SELECT 
            c.agent_id,
            COUNT(*) as total_convs,
            COUNT(*) FILTER (WHERE c.status != 'closed') as active_convs
        FROM conversations c
        WHERE c.tenant_id = p_tenant_id
        GROUP BY c.agent_id
    )
    SELECT 
        a.id as agent_id,
        COALESCE(metrics.tokens, 0)::numeric as total_tokens,
        GREATEST(COALESCE(metrics.msgs_recorded, 0), COALESCE(mc.msgs_synthetic, 0))::numeric as total_messages,
        COALESCE(metrics.stt, 0)::numeric as total_stt,
        COALESCE(metrics.tts, 0)::numeric as total_tts,
        COALESCE(metrics.cost, 0)::numeric as recorded_cost,
        COALESCE(ca.total_convs, 0)::numeric as total_conversations,
        COALESCE(ca.active_convs, 0)::numeric as active_conversations,
        (
            (COALESCE(metrics.tokens, 0) / 1000 * v_llm_rate) +
            (GREATEST(COALESCE(metrics.msgs_recorded, 0), COALESCE(mc.msgs_synthetic, 0)) * v_msg_rate) +
            (COALESCE(metrics.stt, 0) * (v_voice_rate + v_twilio_rate)) +
            (COALESCE(metrics.tts, 0) * (v_voice_rate + v_twilio_rate))
        )::numeric as internal_operational_cost
    FROM agents a
    LEFT JOIN metrics_agg metrics ON a.id = metrics.agent_id
    LEFT JOIN msg_counts mc ON a.id = mc.agent_id
    LEFT JOIN conv_agg ca ON a.id = ca.agent_id
    WHERE a.tenant_id = p_tenant_id;
END;
$$;

-- 2. Master Dashboard RPC (returns calculated agents with usage.totalCost matching frontend structure)
CREATE OR REPLACE FUNCTION get_dashboard_summary(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_agents JSONB;
    v_company JSONB;
BEGIN
    SELECT jsonb_agg(enriched) INTO v_agents
    FROM (
        SELECT 
            a.id,
            a.name,
            a.tenant_id as "tenantId",
            a.status,
            a.channels,
            a.brain_config,
            a.lifecycle_stage as "lifecycleStage",
            a.risk_level as "riskLevel",
            a.role,
            a.type,
            a.evolution_instance,
            a.evolution_token,
            COALESCE(a.session_timeout_seconds, 3600) as "sessionTimeoutSeconds",
            COALESCE(a.context_window, 10) as "contextWindow",
            a.voice_config as "voiceConfig",
            a.integration_config as "integrationConfig",
            a.parent_agent_id,
            a.is_gatekeeper,
            a.gatekeeper_scope,
            a.requires_security,
            s.total_conversations as "totalConversations",
            s.active_conversations as "activeConversations",
            a.max_concurrency as "maxConcurrentConversations",
            jsonb_build_object(
                'totalTokens', s.total_tokens,
                'totalMessages', s.total_messages,
                'totalStt', s.total_stt,
                'totalTts', s.total_tts,
                'totalCost', s.internal_operational_cost
            ) as usage
        FROM agents a
        LEFT JOIN LATERAL get_agent_usage_stats(p_tenant_id) s ON s.agent_id = a.id
        WHERE a.tenant_id = p_tenant_id
    ) enriched;

    SELECT jsonb_build_object(
        'company', c.*,
        'plan', p.*,
        'planName', COALESCE(p.name, 'Free'),
        'planPrices', jsonb_build_object(
            'llmTokenPrice', COALESCE(p.llm_token_price, 0),
            'messagePrice', COALESCE(p.message_price, 0),
            'sttMinutePrice', COALESCE(p.stt_minute_price, 0),
            'ttsMinutePrice', COALESCE(p.tts_minute_price, 0),
            'basePrice', COALESCE(p.base_price, 0)
        ),
        'limits', COALESCE(p.default_limits, '{}'::jsonb)
    ) INTO v_company
    FROM companies c
    LEFT JOIN plans p ON p.id = c.plan_tier
    WHERE c.id = p_tenant_id;

    RETURN jsonb_build_object(
        'agents', COALESCE(v_agents, '[]'::jsonb),
        'tenant', v_company
    );
END;
$$;


-- 3. Billing Summary RPC (replaces Edge Function 'process-billing')
CREATE OR REPLACE FUNCTION get_billing_summary(p_tenant_id UUID, p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_metrics JSONB;
    v_total_cost NUMERIC := 0;
    v_total_msgs NUMERIC := 0;
    v_total_tokens NUMERIC := 0;
    v_total_stt NUMERIC := 0;
    v_total_tts NUMERIC := 0;
    v_roi_hours NUMERIC := 0;
    v_roi_money NUMERIC := 0;
    v_msg_price NUMERIC := 0.1;
    v_hourly_rate NUMERIC := 30.0;
    v_min_per_msg NUMERIC := 2.0;
BEGIN
    -- Prices and ROI Configs
    SELECT 
        COALESCE(p.message_price, 0.1),
        COALESCE((c.roi_config->>'operator_hourly_rate')::numeric, 30.0),
        COALESCE((c.roi_config->>'avg_min_per_msg')::numeric, 2.0)
    INTO v_msg_price, v_hourly_rate, v_min_per_msg
    FROM companies c
    LEFT JOIN plans p ON p.id = c.plan_tier
    WHERE c.id = p_tenant_id;

    WITH raw_metrics AS (
        -- Recorded Metrics
        SELECT 
            cm.agent_id,
            a.name as agent_name,
            cm.channel::VARCHAR,
            cm.metric_type::VARCHAR,
            cm.value,
            cm.cost,
            cm.recorded_at as timestamp
        FROM consumption_metrics cm
        LEFT JOIN agents a ON cm.agent_id = a.id
        WHERE cm.tenant_id = p_tenant_id
          AND cm.recorded_at >= NOW() - (p_days || ' days')::INTERVAL
          AND cm.metric_type != 'messages'
        
        UNION ALL

        -- Synthetic Message Metrics
        SELECT 
            conv.agent_id,
            COALESCE(a.name, 'Agente')::VARCHAR as agent_name,
            COALESCE(conv.channel::VARCHAR, 'Agente')::VARCHAR as channel,
            'messages'::VARCHAR as metric_type,
            COUNT(*)::NUMERIC as value,
            (COUNT(*) * v_msg_price)::NUMERIC as cost,
            date_trunc('hour', m.created_at) as timestamp
        FROM messages m
        LEFT JOIN conversations conv ON m.conversation_id = conv.id
        LEFT JOIN agents a ON conv.agent_id = a.id
        WHERE m.tenant_id = p_tenant_id
          AND m.created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY conv.agent_id, a.name, conv.channel, date_trunc('hour', m.created_at)
    )
    SELECT 
        jsonb_agg(rm), 
        SUM(cost), 
        SUM(CASE WHEN metric_type = 'messages' THEN value ELSE 0 END),
        SUM(CASE WHEN metric_type = 'tokens' THEN value ELSE 0 END),
        SUM(CASE WHEN metric_type = 'stt_minutes' THEN value ELSE 0 END),
        SUM(CASE WHEN metric_type = 'tts_minutes' THEN value ELSE 0 END)
    INTO v_metrics, v_total_cost, v_total_msgs, v_total_tokens, v_total_stt, v_total_tts
    FROM raw_metrics rm;

    v_roi_hours := (v_total_msgs * v_min_per_msg) / 60;
    v_roi_money := v_roi_hours * v_hourly_rate;

    RETURN jsonb_build_object(
        'success', true,
        'data', COALESCE(v_metrics, '[]'::jsonb),
        'summary', jsonb_build_object(
            'totalCost', v_total_cost,
            'totalMessages', v_total_msgs,
            'totalTokens', v_total_tokens,
            'totalSTT', v_total_stt,
            'totalTTS', v_total_tts,
            'roi', jsonb_build_object(
                'hoursSaved', v_roi_hours,
                'moneySaved', v_roi_money,
                'display', CASE 
                    WHEN v_roi_hours >= 1 THEN floor(v_roi_hours)::text || 'h ' || round((v_roi_hours % 1) * 60)::text || 'm'
                    ELSE round(v_roi_hours * 60)::text || 'm'
                END
            )
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_billing_summary(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_agent_usage_stats(UUID) TO authenticated;
