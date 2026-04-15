-- RPC FINAL V4.3: Insights Executivos — Correções Cirúrgicas (Respostas + Conversões)
-- Mudanças vs V4.2:
--   1. Respostas: Conta msgs inbound reais (não response_detected, que fica desatualizado)
--   2. Conversões: Conta status='converted' na fila (não success_link_filter, que pode ser nulo)
--   3. total_messages retornado tanto em totals quanto no daily para compatibilidade com frontend

CREATE OR REPLACE FUNCTION public.get_executive_insights(
  p_tenant_id UUID,
  p_days INTEGER DEFAULT 0 
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date TIMESTAMP;
  v_total_campaigns BIGINT;
  v_total_leads BIGINT;
  v_total_sent BIGINT;
  v_total_responses BIGINT;
  v_total_conversions BIGINT;
  v_total_messages BIGINT;          -- Todas as msgs do tenant no período
  v_campaign_messages BIGINT;       -- Só msgs de conversas vinculadas a campanhas
  v_avg_msgs_total NUMERIC;
  v_avg_msgs_converted NUMERIC;
  v_avg_msgs_failed NUMERIC;
  v_daily_data JSONB;
  v_campaign_breakdown JSONB;
BEGIN
    -- 1. Janela Temporal
    IF p_days = 0 THEN 
        v_start_date := CURRENT_DATE;
    ELSIF p_days = -1 THEN 
        v_start_date := '2020-01-01'::TIMESTAMP;
    ELSE 
        v_start_date := (CURRENT_DATE - (p_days || ' days')::INTERVAL);
    END IF;

    -- 2. Campanhas ativas no período
    SELECT COUNT(*) INTO v_total_campaigns 
    FROM campaigns 
    WHERE tenant_id = p_tenant_id 
      AND (created_at >= v_start_date OR status = 'active');

    -- 3. Total de Leads carregados na fila (Carga)
    SELECT COUNT(DISTINCT contact_phone) INTO v_total_leads 
    FROM outbound_queue 
    WHERE tenant_id = p_tenant_id 
      AND created_at >= v_start_date;

    -- 4. Mensagens enviadas com sucesso (Válidos)
    SELECT COUNT(DISTINCT contact_phone) INTO v_total_sent 
    FROM outbound_queue 
    WHERE tenant_id = p_tenant_id 
      AND status IN ('sent', 'responded', 'converted')
      AND created_at >= v_start_date;

    -- 5. RESPOSTAS REAIS: Conversas de campanha que tiveram pelo menos 1 msg do cliente
    --    (NÃO usa response_detected — esse campo pode estar desatualizado)
    SELECT COUNT(DISTINCT oq.contact_phone) INTO v_total_responses
    FROM outbound_queue oq
    WHERE oq.tenant_id = p_tenant_id
      AND oq.created_at >= v_start_date
      AND EXISTS (
          SELECT 1 
          FROM messages m
          JOIN conversations c ON m.conversation_id = c.id
          WHERE REGEXP_REPLACE(c.user_identifier, '[^0-9]', '', 'g') = REGEXP_REPLACE(oq.contact_phone, '[^0-9]', '', 'g')
            AND c.tenant_id = p_tenant_id
            AND m.direction = 'inbound'
      );

    -- 6. CONVERSÕES REAIS: Status 'converted' na fila
    --    (NÃO usa success_link_filter — pode ser nulo e não é confiável)
    SELECT COUNT(DISTINCT contact_phone) INTO v_total_conversions
    FROM outbound_queue
    WHERE tenant_id = p_tenant_id
      AND status = 'converted'
      AND created_at >= v_start_date;

    -- 7a. Volume Total de Mensagens (TODAS as msgs do tenant no período)
    SELECT COUNT(*) INTO v_total_messages
    FROM messages m
    WHERE m.tenant_id = p_tenant_id
      AND m.created_at >= v_start_date;

    -- 7b. Volume de Mensagens de Campanhas
    --     Usa campaigns.total_messages — mesma fonte da tabela Campanha Executiva (consistência garantida)
    SELECT COALESCE(SUM(total_messages), 0) INTO v_campaign_messages
    FROM campaigns
    WHERE tenant_id = p_tenant_id;

    -- 8. Médias de Esforço (KPIs de I.A — Proteção contra NULL)
    SELECT 
        COALESCE(ROUND(AVG(msg_count), 1), 0),
        COALESCE(ROUND(AVG(msg_count) FILTER (WHERE converted = TRUE), 1), 0),
        COALESCE(ROUND(AVG(msg_count) FILTER (WHERE converted = FALSE), 1), 0)
    INTO v_avg_msgs_total, v_avg_msgs_converted, v_avg_msgs_failed
    FROM (
        SELECT 
            oq.contact_phone,
            (SELECT COUNT(*) FROM messages m 
             JOIN conversations c ON m.conversation_id = c.id
             WHERE REGEXP_REPLACE(c.user_identifier, '[^0-9]', '', 'g') = REGEXP_REPLACE(oq.contact_phone, '[^0-9]', '', 'g')
               AND c.tenant_id = p_tenant_id) as msg_count,
            (oq.status = 'converted') as converted
        FROM outbound_queue oq
        WHERE oq.tenant_id = p_tenant_id 
          AND oq.status IN ('sent', 'responded', 'converted')
          AND oq.created_at >= v_start_date
    ) contact_stats;

    -- 9. Gráfico Diário (Com campo total_messages por dia)
    WITH daily_series AS (
        SELECT generate_series(v_start_date::DATE, CURRENT_DATE, '1 day'::interval)::DATE as day
    ),
    daily_queue AS (
        SELECT 
            created_at::DATE as day,
            COUNT(DISTINCT contact_phone) as sent,
            COUNT(DISTINCT contact_phone) FILTER (WHERE status = 'converted') as conversions
        FROM outbound_queue
        WHERE tenant_id = p_tenant_id AND created_at >= v_start_date
        GROUP BY 1
    ),
    daily_msgs AS (
        SELECT 
            m.created_at::DATE as day,
            COUNT(*) as total_messages
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE c.tenant_id = p_tenant_id AND m.created_at >= v_start_date
          AND EXISTS (SELECT 1 FROM outbound_queue oq WHERE oq.tenant_id = p_tenant_id AND REGEXP_REPLACE(oq.contact_phone, '[^0-9]', '', 'g') = REGEXP_REPLACE(c.user_identifier, '[^0-9]', '', 'g'))
        GROUP BY 1
    )
    SELECT jsonb_agg(t ORDER BY t.date) INTO v_daily_data FROM (
        SELECT 
            ds.day as date,
            COALESCE(dq.sent, 0) as sent,
            COALESCE(dq.conversions, 0) as conversions,
            COALESCE(dm.total_messages, 0) as total_messages
        FROM daily_series ds
        LEFT JOIN daily_queue dq ON ds.day = dq.day
        LEFT JOIN daily_msgs dm ON ds.day = dm.day
    ) t;

    -- 10. Ranking de Campanhas
    SELECT jsonb_agg(t) INTO v_campaign_breakdown FROM (
        SELECT 
            c.name, 
            COUNT(oq.id) as sent, 
            COUNT(oq.id) FILTER (WHERE oq.status = 'converted') as conversions
        FROM campaigns c
        JOIN outbound_queue oq ON oq.campaign_id = c.id
        WHERE c.tenant_id = p_tenant_id AND oq.created_at >= v_start_date
        GROUP BY 1 ORDER BY 2 DESC LIMIT 5
    ) t;

    RETURN json_build_object(
        'totals', json_build_object(
            'leads', COALESCE(v_total_leads, 0),
            'campaigns', COALESCE(v_total_campaigns, 0),
            'sent', COALESCE(v_total_sent, 0),
            'responses', COALESCE(v_total_responses, 0),
            'conversions', COALESCE(v_total_conversions, 0),
            'messages', COALESCE(v_total_messages, 0),
            'total_messages', COALESCE(v_total_messages, 0),           -- Alias compat: total geral
            'campaign_messages', COALESCE(v_campaign_messages, 0)      -- Só msgs de campanha
        ),
        'averages', json_build_object(
            'total', COALESCE(v_avg_msgs_total, 0),
            'converted', COALESCE(v_avg_msgs_converted, 0),
            'failed', COALESCE(v_avg_msgs_failed, 0)
        ),
        'daily', COALESCE(v_daily_data, '[]'::jsonb),
        'campaigns_rank', COALESCE(v_campaign_breakdown, '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_executive_insights(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_executive_insights(uuid, integer) TO service_role;
