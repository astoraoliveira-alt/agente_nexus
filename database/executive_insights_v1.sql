-- RPC FINAL V4.2: Insights Executivos com Funil Completo (Carga vs Sucesso)
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
  v_total_leads BIGINT; -- NOVA MÉTRICA (CARGA TOTAL)
  v_total_sent BIGINT;
  v_total_responses BIGINT;
  v_total_conversions BIGINT;
  v_avg_msgs_total NUMERIC;
  v_avg_msgs_converted NUMERIC;
  v_avg_msgs_failed NUMERIC;
  v_daily_data JSONB;
  v_campaign_breakdown JSONB;
BEGIN
    -- 1. Definir Janela Temporal
    IF p_days = 0 THEN 
        v_start_date := CURRENT_DATE;
    ELSIF p_days = -1 THEN 
        v_start_date := '2020-01-01'::TIMESTAMP;
    ELSE 
        v_start_date := (CURRENT_DATE - (p_days || ' days')::INTERVAL);
    END IF;

    -- 2. Contagens Básicas (Funil de Vendas)
    SELECT COUNT(*) INTO v_total_campaigns FROM campaigns WHERE tenant_id = p_tenant_id AND (created_at >= v_start_date OR status = 'active');
    
    -- [NOVO] Total de Leads carregados na fila (Independente de status)
    SELECT COUNT(DISTINCT contact_phone) INTO v_total_leads FROM outbound_queue 
    WHERE tenant_id = p_tenant_id AND created_at >= v_start_date;

    -- Total de mensagens enviadas com SUCESSO
    SELECT COUNT(DISTINCT contact_phone) INTO v_total_sent FROM outbound_queue 
    WHERE tenant_id = p_tenant_id AND status = 'sent' AND created_at >= v_start_date;

    -- Total de respostas detectadas
    SELECT COUNT(DISTINCT contact_phone) INTO v_total_responses FROM outbound_queue 
    WHERE tenant_id = p_tenant_id AND response_detected = TRUE AND created_at >= v_start_date;

    -- 3. Métricas de Eficiência e Conversão
    WITH contact_stats AS (
        SELECT 
            oq.contact_phone,
            oq.campaign_id,
            (SELECT COUNT(*) FROM messages m 
             JOIN conversations c ON m.conversation_id = c.id
             WHERE REGEXP_REPLACE(c.user_identifier, '[^0-9]', '', 'g') = REGEXP_REPLACE(oq.contact_phone, '[^0-9]', '', 'g')
               AND c.tenant_id = p_tenant_id) as msg_count,
            (EXISTS (
                SELECT 1 FROM messages m 
                JOIN conversations c ON m.conversation_id = c.id
                JOIN campaigns cp ON oq.campaign_id = cp.id
                WHERE REGEXP_REPLACE(c.user_identifier, '[^0-9]', '', 'g') = REGEXP_REPLACE(oq.contact_phone, '[^0-9]', '', 'g')
                  AND c.tenant_id = p_tenant_id
                  AND m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system')
                  AND COALESCE(cp.success_link_filter, '') <> ''
                  AND m.content ILIKE '%' || cp.success_link_filter || '%'
            )) as converted
        FROM outbound_queue oq
        WHERE oq.tenant_id = p_tenant_id AND oq.status = 'sent' AND oq.created_at >= v_start_date
    )
    SELECT 
        COUNT(*) FILTER (WHERE converted = TRUE),
        AVG(msg_count),
        AVG(msg_count) FILTER (WHERE converted = TRUE),
        AVG(msg_count) FILTER (WHERE converted = FALSE)
    INTO 
        v_total_conversions,
        v_avg_msgs_total,
        v_avg_msgs_converted,
        v_avg_msgs_failed
    FROM contact_stats;

    -- 4. Gráfico Diário (Volume de Operação)
    SELECT jsonb_agg(t) INTO v_daily_data FROM (
        SELECT 
            d::DATE as date,
            COUNT(DISTINCT oq.contact_phone) as sent,
            COUNT(DISTINCT oq.contact_phone) FILTER (WHERE oq.response_detected = TRUE) as responses,
            (SELECT COUNT(*) FROM messages m2 
             JOIN conversations c2 ON m2.conversation_id = c2.id 
             WHERE c2.tenant_id = p_tenant_id AND m2.created_at::DATE = d::DATE) as total_messages
        FROM generate_series(v_start_date::DATE, CURRENT_DATE, '1 day'::interval) d
        LEFT JOIN outbound_queue oq ON oq.created_at::DATE = d::DATE AND oq.tenant_id = p_tenant_id AND oq.status = 'sent'
        GROUP BY 1, d::DATE ORDER BY 1
    ) t;

    -- 5. Ranking de Campanhas Ativas
    SELECT jsonb_agg(t) INTO v_campaign_breakdown FROM (
        SELECT c.name, COUNT(oq.id) as sent, COUNT(oq.id) FILTER (WHERE oq.response_detected = TRUE) as responses
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
            'conversions', COALESCE(v_total_conversions, 0)
        ),
        'averages', json_build_object(
            'total', ROUND(COALESCE(v_avg_msgs_total, 0), 2),
            'converted', ROUND(COALESCE(v_avg_msgs_converted, 0), 2),
            'failed', ROUND(COALESCE(v_avg_msgs_failed, 0), 2)
        ),
        'daily', COALESCE(v_daily_data, '[]'::jsonb),
        'campaigns_rank', COALESCE(v_campaign_breakdown, '[]'::jsonb)
    );
END;
$$;
