-- =============================================================================
-- Migration: Unified Reengagement + Pre-Approved Reheating Analytics RPC
-- Date: 2026-11-27
-- Purpose:
--   Powers the upgraded ReengagementComparisonView with:
--   1. Reengagement (cold leads) + Pre-Approved Reheating (comite_approved who stopped replying)
--   2. Before vs After uplift metrics & financial value recovered
--   3. Timeline grouped by day / week / month (America/Sao_Paulo)
--   4. Best time-of-day (Manhã / Tarde / Noite) and best hour analysis (BRT)
--   5. Drill-down list of reheated pre-approved leads with post-reheat outcome
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_reheating_and_reengagement_analytics(
    p_tenant_id uuid,
    p_campaign_id uuid DEFAULT NULL,
    p_granularity text DEFAULT 'day'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_gran text := CASE WHEN lower(coalesce(p_granularity, 'day')) IN ('day', 'week', 'month') THEN lower(p_granularity) ELSE 'day' END;
    v_result jsonb;
BEGIN
    WITH
    -- 1. Reengajamento de Campanha (outbound_queue)
    oq_scoped AS (
        SELECT
            oq.id,
            oq.campaign_id,
            oq.contact_phone,
            oq.conversation_id,
            oq.status,
            oq.response_detected,
            oq.sent_at,
            oq.reengagement_attempt_count,
            oq.reengagement_last_sent_at
        FROM public.outbound_queue oq
        WHERE oq.tenant_id = p_tenant_id
          AND (p_campaign_id IS NULL OR oq.campaign_id = p_campaign_id)
          AND oq.status IN ('sent', 'delivered', 'read')
    ),
    reeng_events AS (
        SELECT
            o.id,
            o.contact_phone,
            o.conversation_id,
            o.reengagement_last_sent_at AS sent_at,
            (o.reengagement_last_sent_at AT TIME ZONE 'America/Sao_Paulo') AS sent_brt,
            (
                o.response_detected = true
                AND EXISTS (
                    SELECT 1 FROM public.messages m
                    WHERE m.conversation_id = o.conversation_id
                      AND m.direction = 'inbound'
                      AND m.created_at >= o.reengagement_last_sent_at
                )
            ) AS replied_after
        FROM oq_scoped o
        WHERE o.reengagement_attempt_count > 0
          AND o.reengagement_last_sent_at IS NOT NULL
    ),
    reeng_summary AS (
        SELECT
            (SELECT count(*) FROM oq_scoped) AS orig_sent,
            (SELECT count(*) FROM oq_scoped WHERE response_detected = true) AS total_replied_all,
            count(*) AS reeng_sent,
            count(*) FILTER (WHERE replied_after) AS reeng_replied
        FROM reeng_events
    ),
    -- 2. Reaquecimento de Pré-Aprovados (comite_approved que receberam oferta e depois reaquecimento proativo)
    pre_leads AS (
        SELECT DISTINCT ON (al.whatsapp)
            al.id AS lead_id,
            al.tenant_id,
            al.campaign_id,
            al.whatsapp,
            al.name,
            al.identifier AS cnpj,
            al.metadata,
            c.id AS conversation_id,
            c.status AS conv_status,
            c.assigned_operator_id,
            camp.name AS campaign_name,
            CASE
                WHEN (al.metadata->>'fiserv_amount_approved') ~ '^[0-9]+(\.[0-9]+)?$'
                THEN (al.metadata->>'fiserv_amount_approved')::numeric
                ELSE 0
            END AS approved_amount
        FROM public.agent_leads al
        LEFT JOIN public.campaigns camp ON camp.id = al.campaign_id
        LEFT JOIN LATERAL (
            SELECT c2.id, c2.status, c2.assigned_operator_id
            FROM public.conversations c2
            WHERE c2.tenant_id = al.tenant_id
              AND (c2.user_identifier = al.whatsapp OR c2.user_identifier = regexp_replace(al.whatsapp, '^55', ''))
            ORDER BY c2.updated_at DESC
            LIMIT 1
        ) c ON true
        WHERE al.tenant_id = p_tenant_id
          AND (p_campaign_id IS NULL OR al.campaign_id = p_campaign_id)
          AND (
              al.metadata->>'fiserv_status' IN ('comite_approved', 'approved', 'pre_approved', 'won', 'formalization')
              OR (al.metadata->>'fiserv_external_status') ILIKE '%aprovado%'
          )
        ORDER BY al.whatsapp, al.created_at DESC
    ),
    pre_with_offer AS (
        SELECT
            pl.*,
            (
                SELECT min(m.created_at)
                FROM public.messages m
                WHERE m.conversation_id = pl.conversation_id
                  AND m.direction = 'outbound'
                  AND (
                      m.content ILIKE '%Boa notícia%'
                      OR m.content ILIKE '%pré-aprovado%'
                      OR m.content ILIKE '%limite de crédito%'
                  )
            ) AS first_offer_at
        FROM pre_leads pl
        WHERE pl.conversation_id IS NOT NULL
    ),
    pre_reheated AS (
        SELECT
            po.*,
            COALESCE(
                NULLIF(po.metadata->>'preapproved_reheat_sent_at', '')::timestamptz,
                (
                    SELECT min(m2.created_at)
                    FROM public.messages m2
                    WHERE m2.conversation_id = po.conversation_id
                      AND m2.direction = 'outbound'
                      AND m2.sender_type IN ('ai', 'agent')
                      AND po.first_offer_at IS NOT NULL
                      AND m2.created_at > po.first_offer_at + interval '20 minutes'
                      AND m2.content NOT ILIKE '%Simulação concluída%'
                      AND m2.content NOT ILIKE '%assumiu a conversa%'
                      AND m2.content NOT ILIKE '%retomou o atendimento%'
                      AND m2.content NOT ILIKE '%O valor solicitado não é válido%'
                      AND m2.content NOT ILIKE '%quantidade de parcelas%'
                      AND NOT EXISTS (
                          SELECT 1 FROM public.messages m_in
                          WHERE m_in.conversation_id = po.conversation_id
                            AND m_in.direction = 'inbound'
                            AND m_in.created_at BETWEEN m2.created_at - interval '5 minutes' AND m2.created_at
                      )
                )
            ) AS reheat_sent_at
        FROM pre_with_offer po
    ),
    pre_outcomes AS (
        SELECT
            pr.*,
            (pr.reheat_sent_at AT TIME ZONE 'America/Sao_Paulo') AS reheat_brt,
            (
                SELECT min(m_rep.created_at)
                FROM public.messages m_rep
                WHERE m_rep.conversation_id = pr.conversation_id
                  AND m_rep.direction = 'inbound'
                  AND pr.reheat_sent_at IS NOT NULL
                  AND m_rep.created_at > pr.reheat_sent_at
            ) AS replied_at,
            (
                pr.reheat_sent_at IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.fiserv_audit_logs fal
                    WHERE fal.registration_code = pr.cnpj
                      AND fal.action = 'simulate'
                      AND fal.ok = true
                      AND fal.created_at > pr.reheat_sent_at
                )
            ) AS simulated_after,
            (
                pr.reheat_sent_at IS NOT NULL AND (
                    pr.assigned_operator_id IS NOT NULL
                    OR pr.conv_status = 'human_active'
                    OR EXISTS (
                        SELECT 1 FROM public.handoff_requests hr
                        WHERE hr.conversation_id = pr.conversation_id
                          AND hr.created_at > pr.reheat_sent_at
                    )
                )
            ) AS handoff_after,
            (
                lower(coalesce(pr.metadata->>'formalization_status', '')) IN ('formalized', 'formalizado', 'won', 'concluido')
                OR lower(coalesce(pr.metadata->>'fiserv_status', '')) = 'won'
                OR pr.metadata->>'formalized_at' IS NOT NULL
            ) AS is_formalized
        FROM pre_reheated pr
        WHERE pr.reheat_sent_at IS NOT NULL
    ),
    pre_summary AS (
        SELECT
            (SELECT count(*) FROM pre_leads) AS total_preapproved,
            count(*) AS reheated,
            count(*) FILTER (WHERE replied_at IS NOT NULL) AS replied,
            count(*) FILTER (WHERE simulated_after) AS simulated,
            count(*) FILTER (WHERE handoff_after) AS handoff,
            count(*) FILTER (WHERE is_formalized) AS formalized,
            coalesce(sum(approved_amount), 0) AS total_reheated_value,
            coalesce(sum(approved_amount) FILTER (WHERE replied_at IS NOT NULL OR simulated_after OR handoff_after OR is_formalized), 0) AS recovered_value
        FROM pre_outcomes
    ),
    -- 3. Timeline (Por Dia / Semana / Mês em America/Sao_Paulo)
    orig_buckets AS (
        SELECT
            date_trunc(v_gran, (o.sent_at AT TIME ZONE 'America/Sao_Paulo')) AS bucket,
            count(*) AS orig_sent,
            count(*) FILTER (WHERE o.response_detected = true AND coalesce(re.replied_after, false) = false) AS orig_replied
        FROM oq_scoped o
        LEFT JOIN reeng_events re ON re.id = o.id
        WHERE o.sent_at IS NOT NULL
          AND (o.sent_at AT TIME ZONE 'America/Sao_Paulo') >= (now() AT TIME ZONE 'America/Sao_Paulo') - CASE v_gran WHEN 'day' THEN interval '30 days' WHEN 'week' THEN interval '12 weeks' ELSE interval '12 months' END
        GROUP BY 1
    ),
    reeng_buckets AS (
        SELECT
            date_trunc(v_gran, sent_brt) AS bucket,
            count(*) AS reeng_sent,
            count(*) FILTER (WHERE replied_after) AS reeng_replied
        FROM reeng_events
        WHERE sent_brt >= (now() AT TIME ZONE 'America/Sao_Paulo') - CASE v_gran WHEN 'day' THEN interval '30 days' WHEN 'week' THEN interval '12 weeks' ELSE interval '12 months' END
        GROUP BY 1
    ),
    reheat_buckets AS (
        SELECT
            date_trunc(v_gran, reheat_brt) AS bucket,
            count(*) AS reheat_sent,
            count(*) FILTER (WHERE replied_at IS NOT NULL) AS reheat_replied,
            count(*) FILTER (WHERE simulated_after) AS reheat_simulated,
            count(*) FILTER (WHERE handoff_after) AS reheat_handoff,
            count(*) FILTER (WHERE is_formalized) AS reheat_formalized
        FROM pre_outcomes
        WHERE reheat_brt >= (now() AT TIME ZONE 'America/Sao_Paulo') - CASE v_gran WHEN 'day' THEN interval '30 days' WHEN 'week' THEN interval '12 weeks' ELSE interval '12 months' END
        GROUP BY 1
    ),
    all_buckets AS (
        SELECT bucket FROM orig_buckets
        UNION
        SELECT bucket FROM reeng_buckets
        UNION
        SELECT bucket FROM reheat_buckets
    ),
    timeline_rows AS (
        SELECT
            ab.bucket,
            CASE v_gran
                WHEN 'day' THEN to_char(ab.bucket, 'DD/MM')
                WHEN 'week' THEN 'Sem ' || to_char(ab.bucket, 'DD/MM')
                ELSE to_char(ab.bucket, 'MM/YYYY')
            END AS period_label,
            coalesce(ob.orig_sent, 0) AS orig_sent,
            coalesce(ob.orig_replied, 0) AS orig_replied,
            coalesce(rb.reeng_sent, 0) AS reeng_sent,
            coalesce(rb.reeng_replied, 0) AS reeng_replied,
            coalesce(hb.reheat_sent, 0) AS reheat_sent,
            coalesce(hb.reheat_replied, 0) AS reheat_replied,
            coalesce(hb.reheat_simulated, 0) AS reheat_simulated,
            coalesce(hb.reheat_handoff, 0) AS reheat_handoff,
            coalesce(hb.reheat_formalized, 0) AS reheat_formalized
        FROM all_buckets ab
        LEFT JOIN orig_buckets ob ON ob.bucket = ab.bucket
        LEFT JOIN reeng_buckets rb ON rb.bucket = ab.bucket
        LEFT JOIN reheat_buckets hb ON hb.bucket = ab.bucket
        ORDER BY ab.bucket DESC
        LIMIT 20
    ),
    -- 4. Performance por Período do Dia e Horário (BRT)
    combined_timing AS (
        SELECT
            extract(hour FROM sent_brt)::int AS hr,
            'reengagement' AS src,
            replied_after AS replied
        FROM reeng_events
        UNION ALL
        SELECT
            extract(hour FROM reheat_brt)::int AS hr,
            'preapproved_reheat' AS src,
            (replied_at IS NOT NULL) AS replied
        FROM pre_outcomes
    ),
    slot_stats AS (
        SELECT
            CASE
                WHEN hr >= 6 AND hr < 12 THEN 'Manhã (08h–12h)'
                WHEN hr >= 12 AND hr < 18 THEN 'Tarde (12h–18h)'
                ELSE 'Noite (18h–22h)'
            END AS slot,
            CASE
                WHEN hr >= 6 AND hr < 12 THEN 1
                WHEN hr >= 12 AND hr < 18 THEN 2
                ELSE 3
            END AS slot_order,
            count(*) AS sent,
            count(*) FILTER (WHERE replied) AS replied,
            count(*) FILTER (WHERE src = 'reengagement') AS reeng_sent,
            count(*) FILTER (WHERE src = 'reengagement' AND replied) AS reeng_replied,
            count(*) FILTER (WHERE src = 'preapproved_reheat') AS reheat_sent,
            count(*) FILTER (WHERE src = 'preapproved_reheat' AND replied) AS reheat_replied
        FROM combined_timing
        GROUP BY 1, 2
        ORDER BY 2
    ),
    hour_stats AS (
        SELECT
            hr AS hour,
            lpad(hr::text, 2, '0') || 'h' AS label,
            count(*) AS sent,
            count(*) FILTER (WHERE replied) AS replied,
            CASE WHEN count(*) > 0 THEN round((count(*) FILTER (WHERE replied)::numeric / count(*)::numeric) * 100, 1) ELSE 0 END AS reply_rate
        FROM combined_timing
        WHERE hr BETWEEN 7 AND 22
        GROUP BY hr
        ORDER BY hr
    )
    SELECT jsonb_build_object(
        'granularity', v_gran,
        'reengagement', (
            SELECT jsonb_build_object(
                'orig_sent', orig_sent,
                'orig_replied', greatest(total_replied_all - reeng_replied, 0),
                'reeng_sent', reeng_sent,
                'reeng_replied', reeng_replied,
                'orig_reply_rate', CASE WHEN orig_sent > 0 THEN round((greatest(total_replied_all - reeng_replied, 0)::numeric / orig_sent::numeric) * 100, 1) ELSE 0 END,
                'reeng_reply_rate', CASE WHEN reeng_sent > 0 THEN round((reeng_replied::numeric / reeng_sent::numeric) * 100, 1) ELSE 0 END,
                'uplift_pct', CASE WHEN greatest(total_replied_all - reeng_replied, 0) > 0 THEN round((reeng_replied::numeric / greatest(total_replied_all - reeng_replied, 0)::numeric) * 100, 1) ELSE 0 END
            ) FROM reeng_summary
        ),
        'preapproved_reheating', (
            SELECT jsonb_build_object(
                'total_preapproved', total_preapproved,
                'reheated', reheated,
                'replied', replied,
                'simulated', simulated,
                'handoff', handoff,
                'formalized', formalized,
                'reply_rate', CASE WHEN reheated > 0 THEN round((replied::numeric / reheated::numeric) * 100, 1) ELSE 0 END,
                'total_reheated_value', round(total_reheated_value, 2),
                'recovered_value', round(recovered_value, 2)
            ) FROM pre_summary
        ),
        'timeline', coalesce((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'period_label', period_label,
                    'orig_sent', orig_sent,
                    'orig_replied', orig_replied,
                    'orig_reply_rate', CASE WHEN orig_sent > 0 THEN round((orig_replied::numeric / orig_sent::numeric) * 100, 1) ELSE 0 END,
                    'react_sent', reeng_sent + reheat_sent,
                    'react_replied', reeng_replied + reheat_replied,
                    'react_reply_rate', CASE WHEN (reeng_sent + reheat_sent) > 0 THEN round(((reeng_replied + reheat_replied)::numeric / (reeng_sent + reheat_sent)::numeric) * 100, 1) ELSE 0 END,
                    'reeng_sent', reeng_sent,
                    'reeng_replied', reeng_replied,
                    'reeng_reply_rate', CASE WHEN reeng_sent > 0 THEN round((reeng_replied::numeric / reeng_sent::numeric) * 100, 1) ELSE 0 END,
                    'reheat_sent', reheat_sent,
                    'reheat_replied', reheat_replied,
                    'reheat_reply_rate', CASE WHEN reheat_sent > 0 THEN round((reheat_replied::numeric / reheat_sent::numeric) * 100, 1) ELSE 0 END,
                    'reheat_simulated', reheat_simulated,
                    'reheat_handoff', reheat_handoff,
                    'reheat_formalized', reheat_formalized
                ) ORDER BY bucket ASC
            ) FROM timeline_rows
        ), '[]'::jsonb),
        'time_of_day', jsonb_build_object(
            'slots', coalesce((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'slot', slot,
                        'sent', sent,
                        'replied', replied,
                        'reply_rate', CASE WHEN sent > 0 THEN round((replied::numeric / sent::numeric) * 100, 1) ELSE 0 END,
                        'reeng_sent', reeng_sent,
                        'reeng_replied', reeng_replied,
                        'reheat_sent', reheat_sent,
                        'reheat_replied', reheat_replied
                    ) ORDER BY slot_order
                ) FROM slot_stats
            ), '[]'::jsonb),
            'by_hour', coalesce((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'hour', hour,
                        'label', label,
                        'sent', sent,
                        'replied', replied,
                        'reply_rate', reply_rate
                    ) ORDER BY hour
                ) FROM hour_stats
            ), '[]'::jsonb),
            'best_slot', (
                SELECT jsonb_build_object(
                    'slot', slot,
                    'sent', sent,
                    'replied', replied,
                    'reply_rate', CASE WHEN sent > 0 THEN round((replied::numeric / sent::numeric) * 100, 1) ELSE 0 END
                )
                FROM slot_stats
                WHERE sent >= 5
                ORDER BY (replied::numeric / NULLIF(sent, 0)::numeric) DESC, sent DESC
                LIMIT 1
            ),
            'best_hour', (
                SELECT jsonb_build_object(
                    'hour', hour,
                    'label', label,
                    'sent', sent,
                    'replied', replied,
                    'reply_rate', reply_rate
                )
                FROM hour_stats
                WHERE sent >= 5
                ORDER BY reply_rate DESC, sent DESC
                LIMIT 1
            )
        ),
        'preapproved_leads', coalesce((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'lead_id', lead_id,
                    'conversation_id', conversation_id,
                    'name', name,
                    'cnpj', cnpj,
                    'whatsapp', whatsapp,
                    'campaign_name', campaign_name,
                    'approved_amount', round(approved_amount, 2),
                    'reheat_sent_at', reheat_sent_at,
                    'replied_at', replied_at,
                    'post_status', CASE
                        WHEN is_formalized THEN 'Formalizado'
                        WHEN handoff_after THEN 'Em Atendimento'
                        WHEN simulated_after THEN 'Simulou'
                        WHEN replied_at IS NOT NULL THEN 'Respondeu'
                        ELSE 'Sem resposta'
                    END
                ) ORDER BY reheat_sent_at DESC
            )
            FROM (SELECT * FROM pre_outcomes ORDER BY reheat_sent_at DESC LIMIT 100) sub
        ), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$function$;
