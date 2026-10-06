-- Migration: 20261006_get_meta_billing_dispatches_report.sql
-- Description: RPC analítica para consolidar cobrança/faturamento Meta por dia e tipo de envio (Campanhas, Reengajamento e Aquecimento/Follow-up)

DROP FUNCTION IF EXISTS public.get_meta_billing_dispatches_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID);

CREATE OR REPLACE FUNCTION public.get_meta_billing_dispatches_report(
    p_tenant_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ,
    p_campaign_id UUID DEFAULT NULL
)
RETURNS TABLE (
    dispatch_date DATE,
    dispatch_type TEXT,
    dispatch_type_label TEXT,
    attempted_count BIGINT,
    delivered_count BIGINT,
    read_count BIGINT,
    replied_count BIGINT,
    failed_count BIGINT,
    delivery_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH categorized_queue AS (
        SELECT 
            oq.id,
            oq.tenant_id,
            oq.campaign_id,
            oq.status,
            oq.response_detected,
            CASE 
                -- 1. Aquecimento de Lead / Follow-up de Funil (Anti-Abandono)
                WHEN COALESCE((oq.metadata->>'is_funnel_followup')::boolean, false) = true 
                     OR (oq.metadata->>'funnel_step') IS NOT NULL 
                     THEN 'funnel_followup'
                -- 2. Reengajamento de Campanha
                WHEN COALESCE(oq.reengagement_attempt_count, 0) > 0 
                     OR oq.reengagement_last_sent_at IS NOT NULL 
                     OR COALESCE((oq.metadata->>'is_reengagement')::boolean, false) = true 
                     THEN 'reengagement'
                -- 3. Disparo de Campanha (Envio Inicial)
                ELSE 'campaign_initial'
            END AS v_dispatch_type,
            CASE 
                WHEN COALESCE(oq.reengagement_attempt_count, 0) > 0 OR oq.reengagement_last_sent_at IS NOT NULL 
                     THEN COALESCE(oq.reengagement_last_sent_at, oq.sent_at, oq.created_at)
                WHEN COALESCE((oq.metadata->>'is_funnel_followup')::boolean, false) = true 
                     THEN COALESCE(oq.sent_at, oq.scheduled_at, oq.created_at)
                ELSE COALESCE(oq.sent_at, oq.created_at)
            END AS v_dispatch_time
        FROM public.outbound_queue oq
        WHERE oq.tenant_id = p_tenant_id
          AND (p_campaign_id IS NULL OR oq.campaign_id = p_campaign_id)
    )
    SELECT 
        (cq.v_dispatch_time AT TIME ZONE 'America/Sao_Paulo')::date AS dispatch_date,
        cq.v_dispatch_type AS dispatch_type,
        CASE cq.v_dispatch_type
            WHEN 'campaign_initial' THEN 'Campanhas (Envio Inicial)'
            WHEN 'reengagement' THEN 'Reengajamento'
            WHEN 'funnel_followup' THEN 'Aquecimento / Anti-Abandono'
            ELSE 'Outros'
        END AS dispatch_type_label,
        COUNT(*) FILTER (
            WHERE trim(lower(cq.status)) IN ('sent', 'delivered', 'read', 'respondida', 'interagiu', 'failed', 'undelivered', 'error', 'not_delivered', 'rejected', 'processing')
               OR cq.v_dispatch_time IS NOT NULL
        )::BIGINT AS attempted_count,
        COUNT(*) FILTER (
            WHERE trim(lower(cq.status)) IN ('delivered', 'read', 'respondida', 'interagiu')
               OR COALESCE(cq.response_detected, false) = true
        )::BIGINT AS delivered_count,
        COUNT(*) FILTER (
            WHERE trim(lower(cq.status)) IN ('read', 'respondida', 'interagiu')
        )::BIGINT AS read_count,
        COUNT(*) FILTER (
            WHERE COALESCE(cq.response_detected, false) = true
               OR trim(lower(cq.status)) IN ('respondida', 'interagiu')
        )::BIGINT AS replied_count,
        COUNT(*) FILTER (
            WHERE trim(lower(cq.status)) IN ('failed', 'undelivered', 'error', 'not_delivered', 'rejected')
        )::BIGINT AS failed_count,
        CASE 
            WHEN COUNT(*) FILTER (WHERE trim(lower(cq.status)) IN ('sent', 'delivered', 'read', 'respondida', 'interagiu', 'failed', 'undelivered', 'error', 'not_delivered', 'rejected', 'processing') OR cq.v_dispatch_time IS NOT NULL) > 0
            THEN ROUND(
                (COUNT(*) FILTER (WHERE trim(lower(cq.status)) IN ('delivered', 'read', 'respondida', 'interagiu') OR COALESCE(cq.response_detected, false) = true)::numeric / 
                 COUNT(*) FILTER (WHERE trim(lower(cq.status)) IN ('sent', 'delivered', 'read', 'respondida', 'interagiu', 'failed', 'undelivered', 'error', 'not_delivered', 'rejected', 'processing') OR cq.v_dispatch_time IS NOT NULL)::numeric) * 100,
                1
            )
            ELSE 0
        END AS delivery_rate
    FROM categorized_queue cq
    WHERE cq.v_dispatch_time >= p_start_date
      AND cq.v_dispatch_time <= p_end_date
    GROUP BY 1, 2
    ORDER BY dispatch_date DESC, cq.v_dispatch_type ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_meta_billing_dispatches_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_meta_billing_dispatches_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO service_role;
