-- =============================================
-- DASHMASTER V1.2: Support for Agent Hierarchies (Sub-agents)
-- Consolidates sub-agent metrics into their parents for the Ranking section.
-- Filters out sub-agents from the individual listing.
-- =============================================

CREATE OR REPLACE FUNCTION get_dashmaster_v1(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMP := NOW();
    v_30_days_ago TIMESTAMP := NOW() - INTERVAL '30 days';
    v_result JSONB;
    
    -- Business Rates (ROI & Selling Prices)
    v_msg_price_venda NUMERIC := 0.1;
    v_llm_1k_price_venda NUMERIC := 0.50;
    v_stt_price_venda NUMERIC := 0.20;
    v_tts_price_venda NUMERIC := 0.20;
    
    v_operator_hour_rate NUMERIC := 30.0;
    v_interaction_minutes NUMERIC := 2.0; -- Minutes saved per message/interaction

    -- State Aggregates
    v_total_convs INT;
    v_active_convs INT;
    v_human_handoffs INT;
    v_incidents_open INT;
    v_incidents_inv INT;
    v_incidents_res INT;
    v_total_evals INT;
    v_avg_score NUMERIC;
    v_total_contacts INT;
    v_hot_leads INT;
    v_warm_leads INT;
    v_cold_leads INT;

    -- Usage Aggregates
    v_total_tokens NUMERIC := 0;
    v_total_msgs NUMERIC := 0;
    v_total_stt NUMERIC := 0;
    v_total_tts NUMERIC := 0;
    
    -- Plan & Limits
    v_plan_name TEXT;
    v_limits JSONB;

BEGIN
    -- 1. Load Business Configuration (ROI and Prices from Plan/Company)
    SELECT 
        COALESCE(p.name, 'Flex'),
        COALESCE(p.default_limits, '{}'::jsonb),
        COALESCE(p.message_price, 0.1),
        COALESCE(p.llm_token_price, 0.50),
        COALESCE(p.stt_minute_price, 0.20),
        COALESCE(p.tts_minute_price, 0.20),
        COALESCE((c.roi_config->>'operator_hourly_rate')::numeric, 30.0),
        COALESCE((c.roi_config->>'avg_human_minutes_per_interaction')::numeric, 2.0)
    INTO 
        v_plan_name, v_limits, v_msg_price_venda, v_llm_1k_price_venda, 
        v_stt_price_venda, v_tts_price_venda, v_operator_hour_rate, v_interaction_minutes
    FROM companies c
    LEFT JOIN plans p ON p.id = c.plan_tier
    WHERE c.id = p_tenant_id;

    -- 2. Conversation & Incident Statistics
    SELECT COUNT(*) INTO v_total_convs FROM conversations WHERE tenant_id = p_tenant_id;
    SELECT COUNT(*) INTO v_active_convs FROM conversations WHERE tenant_id = p_tenant_id AND status != 'closed';
    SELECT COUNT(*) INTO v_human_handoffs FROM conversations WHERE tenant_id = p_tenant_id AND (assigned_operator_id IS NOT NULL OR status = 'human_active');
    
    SELECT 
        COUNT(*) FILTER (WHERE status = 'open'),
        COUNT(*) FILTER (WHERE status = 'investigating'),
        COUNT(*) FILTER (WHERE status = 'resolved')
    INTO v_incidents_open, v_incidents_inv, v_incidents_res
    FROM incidents WHERE tenant_id = p_tenant_id;

    -- 3. Quality (Trust Score)
    SELECT 
        COUNT(*), 
        COALESCE(AVG(score), 0)
    INTO v_total_evals, v_avg_score
    FROM evaluations WHERE tenant_id = p_tenant_id;

    -- 4. Contact CRM Distribution
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE lifecycle_status IN ('Lead Quente', 'sql', 'SQL')),
        COUNT(*) FILTER (WHERE lifecycle_status IN ('Interesse Médio', 'mql', 'MQL')),
        COUNT(*) FILTER (WHERE lifecycle_status IN ('Interesse Baixo', 'lead', 'Lead') OR lifecycle_status IS NULL)
    INTO v_total_contacts, v_hot_leads, v_warm_leads, v_cold_leads
    FROM contacts WHERE tenant_id = p_tenant_id;

    -- 5. Consolidated Consumption Metrics (30 days)
    WITH recorded_metrics AS (
        SELECT 
            metric_type, 
            SUM(value) as val
        FROM consumption_metrics
        WHERE tenant_id = p_tenant_id AND recorded_at >= v_30_days_ago
        GROUP BY metric_type
    ),
    synthetic_msgs AS (
        SELECT COUNT(*) as msg_count
        FROM messages
        WHERE tenant_id = p_tenant_id AND created_at >= v_30_days_ago
    )
    SELECT 
        COALESCE((SELECT val FROM recorded_metrics WHERE metric_type = 'tokens'), 0),
        GREATEST(COALESCE((SELECT val FROM recorded_metrics WHERE metric_type = 'messages'), 0), COALESCE((SELECT msg_count FROM synthetic_msgs), 0)),
        COALESCE((SELECT val FROM recorded_metrics WHERE metric_type = 'stt_minutes'), 0),
        COALESCE((SELECT val FROM recorded_metrics WHERE metric_type = 'tts_minutes'), 0)
    INTO v_total_tokens, v_total_msgs, v_total_stt, v_total_tts;

    -- 6. ROI Calculation (Value Generated)
    DECLARE
        v_saved_time_mins NUMERIC := v_total_msgs * v_interaction_minutes;
        v_money_saved NUMERIC := (v_saved_time_mins / 60 * v_operator_hour_rate);
        v_total_cost_venda NUMERIC := (v_total_msgs * v_msg_price_venda) + (v_total_tokens / 1000 * v_llm_1k_price_venda) + (v_total_stt * v_stt_price_venda) + (v_total_tts * v_tts_price_venda);
    BEGIN
        v_result = jsonb_build_object(
            'summary', jsonb_build_object(
                'totalConversations', v_total_convs,
                'activeConversations', v_active_convs,
                'automationRate', CASE WHEN v_total_convs > 0 THEN ROUND(((v_total_convs - v_human_handoffs)::numeric / v_total_convs) * 100, 1) ELSE 100 END,
                'avgTrustScore', ROUND(v_avg_score, 1),
                'totalEvaluations', v_total_evals,
                'roiCriteria', jsonb_build_object(
                    'minsPerMsg', v_interaction_minutes,
                    'operatorHourRate', v_operator_hour_rate
                )
            ),
            'usage', jsonb_build_object(
                'totalMessages', v_total_msgs,
                'totalTokens', v_total_tokens,
                'totalSTT', v_total_stt,
                'totalTTS', v_total_tts,
                'totalCostClient', ROUND(v_total_cost_venda, 2)
            ),
            'financials', jsonb_build_object(
                'totalMoneySaved', ROUND(v_money_saved, 2),
                'displaySavedTime', CASE 
                    WHEN v_saved_time_mins >= 60 THEN (FLOOR(v_saved_time_mins / 60)::text || 'h ' || ROUND(v_saved_time_mins % 60)::text || 'm')
                    ELSE (ROUND(v_saved_time_mins)::text || 'm')
                END
            ),
            'plan', jsonb_build_object(
                'name', v_plan_name,
                'limits', v_limits
            ),
            'incidents', jsonb_build_object(
                'open', v_incidents_open,
                'investigating', v_incidents_inv,
                'resolved', v_incidents_res,
                'total', v_incidents_open + v_incidents_inv + v_incidents_res
            ),
            'contacts', jsonb_build_object(
                'total', v_total_contacts,
                'hot', v_hot_leads,
                'warm', v_warm_leads,
                'cold', v_cold_leads
            ),
            'charts', jsonb_build_object(
                'dailyMessages', (
                    SELECT jsonb_agg(d) FROM (
                        SELECT 
                            TO_CHAR(day, 'DD/MM') as date,
                            COALESCE(SUM(count), 0) as messages
                        FROM generate_series(v_30_days_ago, v_now, interval '1 day') day
                        LEFT JOIN (
                            SELECT date_trunc('day', created_at) as msg_day, COUNT(*) as count
                            FROM messages
                            WHERE tenant_id = p_tenant_id AND created_at >= v_30_days_ago
                            GROUP BY 1
                        ) m ON m.msg_day = date_trunc('day', day)
                        GROUP BY day
                        ORDER BY day
                    ) d
                )
            ),
            -- Agents List Optimized: Consolidates sub-agents into parents
            'agents', (
                SELECT jsonb_agg(ag) FROM (
                    WITH agent_stats AS (
                        SELECT 
                            COALESCE(parent_id, id) as effective_agent_id,
                            -- 30d Messages
                            SUM(CASE WHEN metric_type = 'messages' AND recorded_at >= v_30_days_ago THEN value ELSE 0 END) as msg_count
                        FROM consumption_metrics
                        WHERE tenant_id = p_tenant_id AND (recorded_at >= v_30_days_ago OR recorded_at IS NULL)
                        GROUP BY 1
                    ),
                    conv_stats AS (
                        SELECT 
                            COALESCE(a.parent_id, c.agent_id) as effective_agent_id,
                            COUNT(*) as conv_count
                        FROM conversations c
                        LEFT JOIN agents a ON a.id = c.agent_id
                        WHERE c.tenant_id = p_tenant_id AND c.last_message_at >= v_30_days_ago
                        GROUP BY 1
                    )
                    SELECT 
                        a.id, 
                        a.name, 
                        a.status, 
                        a.role, 
                        a.type,
                        COALESCE(cs.conv_count, 0) as "totalConversations",
                        jsonb_build_object(
                            'totalMessages', COALESCE(ast.msg_count, 0)
                        ) as usage
                    FROM agents a
                    LEFT JOIN agent_stats ast ON ast.effective_agent_id = a.id
                    LEFT JOIN conv_stats cs ON cs.effective_agent_id = a.id
                    WHERE a.tenant_id = p_tenant_id 
                    AND a.parent_id IS NULL -- Only Top-Level Agents shown
                    ORDER BY COALESCE(ast.msg_count, 0) DESC, a.name ASC
                ) ag
            )
        );
    END;

    RETURN v_result;
END;
$$;
