-- ====================================================================
-- MIGRATION: 20261119_optimize_get_sales_cockpit_leads
-- Descrição: Otimiza a RPC get_sales_cockpit_leads para eliminar
--            statement timeout (57014):
--            1. Cria índices em conversations(tenant_id, user_identifier),
--               messages(conversation_id, created_at DESC) e
--               agent_leads(tenant_id, created_at DESC).
--            2. Remove subconsulta COUNT(*) FROM messages do ORDER BY
--               do LATERAL de conversations.
--            3. Consolida as 3 subconsultas de messages em um único
--               LATERAL sobre a conversa selecionada.
-- ====================================================================

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_user_identifier
  ON public.conversations (tenant_id, user_identifier);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
  ON public.messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_leads_tenant_created
  ON public.agent_leads (tenant_id, created_at DESC);

DROP FUNCTION IF EXISTS public.get_sales_cockpit_leads(UUID, UUID, UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.get_sales_cockpit_leads(
  p_tenant_id UUID,
  p_agent_id UUID DEFAULT NULL,
  p_campaign_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_user_role TEXT DEFAULT 'operator',
  p_stage_filter TEXT DEFAULT 'all'
)
RETURNS TABLE (
  lead_id UUID,
  conversation_id UUID,
  name TEXT,
  cnpj TEXT,
  phone TEXT,
  campaign_id UUID,
  campaign_name TEXT,
  campaign_status TEXT,
  requested_amount NUMERIC,
  requested_installments TEXT,
  monthly_payment NUMERIC,
  interest_rate NUMERIC,
  total_contract_amount NUMERIC,
  loan_request_id TEXT,
  pipeline_stage TEXT,
  assigned_operator_id UUID,
  assigned_operator TEXT,
  conversation_status TEXT,
  total_messages BIGINT,
  last_message_content TEXT,
  last_message_time TIMESTAMP WITH TIME ZONE,
  messages JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH qualified_leads AS (
    SELECT DISTINCT ON (clean_phone)
      al.id AS q_lead_id,
      al.tenant_id AS q_tenant_id,
      al.campaign_id AS q_campaign_id,
      al.name AS q_name,
      al.whatsapp AS q_whatsapp,
      al.identifier AS q_cnpj,
      al.metadata AS q_metadata,
      al.created_at AS q_created_at,
      camp.id AS q_camp_id,
      camp.name::text AS q_campaign_name,
      camp.status::text AS q_campaign_status,
      regexp_replace(al.whatsapp, '\D', '', 'g') AS clean_phone
    FROM agent_leads al
    JOIN campaigns camp ON camp.id = al.campaign_id
    WHERE al.tenant_id = p_tenant_id
      AND (
          (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'ok_agente')::boolean = true
          OR al.metadata->'accepted_proposal' IS NOT NULL
          OR (
              (
                COALESCE(al.metadata->>'fiserv_status', '') IN ('comite_approved', 'approved', 'pre_approved')
                OR (al.metadata->>'fiserv_is_approved')::boolean = true
                OR (
                  (al.metadata->>'fiserv_amount_approved') IS NOT NULL
                  AND (al.metadata->>'fiserv_amount_approved') ~ '^[0-9]+(\.[0-9]+)?$'
                  AND (al.metadata->>'fiserv_amount_approved')::numeric > 0
                )
                OR COALESCE(al.metadata->>'fiserv_external_status', '') ILIKE '%aprovado%'
              )
              AND (
                COALESCE(al.metadata->>'formalization_status', '') IN ('in_service', 'em_atendimento', 'in_progress', 'formalization')
                OR al.metadata->>'operator_assigned_at' IS NOT NULL
                OR EXISTS (
                  SELECT 1 FROM conversations c_chk
                  WHERE c_chk.tenant_id = al.tenant_id
                    AND c_chk.user_identifier IN (
                        al.whatsapp,
                        regexp_replace(al.whatsapp, '\D', '', 'g'),
                        '55' || regexp_replace(al.whatsapp, '\D', '', 'g'),
                        RIGHT(regexp_replace(al.whatsapp, '\D', '', 'g'), 11)
                    )
                    AND (c_chk.assigned_operator_id IS NOT NULL OR c_chk.status = 'human_active')
                )
              )
          )
      )
      AND COALESCE(al.metadata->>'fiserv_status', '') NOT IN ('denied', 'lost', 'cancelled', 'fails_to_process', 'rejected')
      AND (
          COALESCE(al.metadata->>'fiserv_status', '') IN ('comite_approved', 'approved', 'pre_approved', 'in_quoting')
          OR (
            (al.metadata->>'fiserv_amount_approved') IS NOT NULL
            AND (al.metadata->>'fiserv_amount_approved') ~ '^[0-9]+(\.[0-9]+)?$'
            AND (al.metadata->>'fiserv_amount_approved')::numeric > 0
          )
          OR COALESCE(al.metadata->>'fiserv_external_status', '') ILIKE '%aprovado%'
          OR COALESCE((al.metadata->>'fiserv_is_approved')::boolean, true) IS NOT FALSE
      )
      AND al.metadata->>'lost_reason' IS NULL
      AND al.metadata->>'refusal_reason' IS NULL
      AND COALESCE(al.metadata->>'formalization_status', '') != 'lost'
      AND COALESCE(al.metadata->>'fiserv_external_status', '') NOT ILIKE '%não conseguimos%'
      AND COALESCE(al.metadata->>'fiserv_external_status', '') NOT ILIKE '%nao conseguimos%'
      AND COALESCE(al.metadata->>'fiserv_external_status', '') NOT ILIKE '%reprovad%'
      AND camp.tenant_id = p_tenant_id
      AND camp.status IN ('active', 'completed')
      AND (p_agent_id IS NULL OR camp.agent_id = p_agent_id)
      AND (p_campaign_id IS NULL OR camp.id = p_campaign_id)
    ORDER BY clean_phone, al.created_at DESC
  )
  SELECT
    ql.q_lead_id AS lead_id,
    conv.id AS conversation_id,
    COALESCE(ql.q_name, conv.user_name, 'Cliente')::text AS name,
    ql.q_cnpj::text AS cnpj,
    ql.q_whatsapp::text AS phone,
    ql.q_camp_id AS campaign_id,
    ql.q_campaign_name AS campaign_name,
    ql.q_campaign_status AS campaign_status,
    COALESCE(
        (ql.q_metadata->'accepted_proposal'->>'amount')::numeric,
        (ql.q_metadata->'simulation_data'->>'amount')::numeric,
        (ql.q_metadata->>'requested_amount')::numeric,
        0
    ) AS requested_amount,
    COALESCE(
        ql.q_metadata->'accepted_proposal'->>'installments',
        ql.q_metadata->'simulation_data'->>'installments',
        ql.q_metadata->>'requested_installments',
        '24'
    )::text AS requested_installments,
    COALESCE(
        (ql.q_metadata->'accepted_proposal'->>'installment_value')::numeric,
        (ql.q_metadata->'simulation_data'->>'installment_value')::numeric,
        0
    ) AS monthly_payment,
    COALESCE(
        (ql.q_metadata->'accepted_proposal'->>'monthly_interest')::numeric,
        (ql.q_metadata->'simulation_data'->>'monthly_interest')::numeric,
        2.52
    ) AS interest_rate,
    COALESCE(
        (ql.q_metadata->'accepted_proposal'->>'total_debt')::numeric,
        (ql.q_metadata->'simulation_data'->>'total_debt')::numeric,
        0
    ) AS total_contract_amount,
    (ql.q_metadata->>'loan_request_id')::text AS loan_request_id,
    COALESCE(
        conv.metadata->>'pipeline_stage',
        ql.q_metadata->>'pipeline_stage',
        CASE
            WHEN conv.assigned_operator_id IS NOT NULL OR conv.status = 'human_active' THEN 'in_contact'
            ELSE 'pending_contact'
        END
    )::text AS pipeline_stage,
    COALESCE(conv.assigned_operator_id, (ql.q_metadata->>'operator_id')::uuid) AS assigned_operator_id,
    COALESCE(
        u.full_name,
        conv.metadata->>'operator_name',
        ql.q_metadata->>'operator_name',
        ql.q_metadata->>'assigned_operator'
    )::text AS assigned_operator,
    conv.status::text AS conversation_status,
    COALESCE(msg_stats.total_messages, 0)::bigint AS total_messages,
    msg_stats.last_message_content::text AS last_message_content,
    COALESCE(conv.last_message_at, ql.q_created_at) AS last_message_time,
    COALESCE(msg_stats.messages_agg, '[]'::jsonb) AS messages
  FROM qualified_leads ql
  LEFT JOIN LATERAL (
    SELECT
      c.id,
      c.status,
      c.assigned_operator_id,
      c.metadata,
      c.last_message_at,
      c.created_at,
      c.user_identifier,
      c.user_name
    FROM conversations c
    WHERE c.tenant_id = ql.q_tenant_id
      AND c.user_identifier IN (
          ql.q_whatsapp,
          ql.clean_phone,
          '55' || ql.clean_phone,
          RIGHT(ql.clean_phone, 11),
          '55' || RIGHT(ql.clean_phone, 11)
      )
    ORDER BY
      CASE WHEN c.campaign_id = ql.q_camp_id THEN 1 ELSE 2 END,
      CASE WHEN c.status = 'human_active' THEN 1 WHEN c.status = 'ai_active' THEN 2 ELSE 3 END,
      c.last_message_at DESC NULLS LAST,
      c.created_at DESC
    LIMIT 1
  ) conv ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::bigint AS total_messages,
      (ARRAY_AGG(m_sub.content ORDER BY m_sub.created_at DESC))[1] AS last_message_content,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', m_sub.id,
            'conversation_id', m_sub.conversation_id,
            'tenant_id', m_sub.tenant_id,
            'content', m_sub.content,
            'direction', m_sub.direction,
            'sender_type', m_sub.sender_type,
            'sender_name', m_sub.sender_name,
            'message_type', m_sub.message_type,
            'status', m_sub.status,
            'audio_url', m_sub.audio_url,
            'created_at', m_sub.created_at
          ) ORDER BY m_sub.created_at ASC
        ),
        '[]'::jsonb
      ) AS messages_agg
    FROM (
      SELECT
        m_inner.id,
        m_inner.conversation_id,
        m_inner.tenant_id,
        m_inner.content,
        m_inner.direction,
        m_inner.sender_type,
        m_inner.sender_name,
        m_inner.message_type,
        m_inner.status,
        m_inner.audio_url,
        m_inner.created_at
      FROM messages m_inner
      WHERE m_inner.conversation_id = conv.id
      ORDER BY m_inner.created_at DESC
      LIMIT 100
    ) m_sub
  ) msg_stats ON conv.id IS NOT NULL
  LEFT JOIN users u ON u.id = COALESCE(conv.assigned_operator_id, (ql.q_metadata->>'operator_id')::uuid)
  WHERE
    (
        p_user_role IN ('super_admin', 'admin', 'tenant_admin', 'administrador')
        OR (
            (conv.assigned_operator_id IS NULL AND COALESCE(conv.metadata->>'pipeline_stage', ql.q_metadata->>'pipeline_stage', 'pending_contact') = 'pending_contact')
            OR conv.assigned_operator_id = p_user_id
            OR (ql.q_metadata->>'operator_id')::uuid = p_user_id
        )
    )
    AND (
        p_stage_filter = 'all'
        OR COALESCE(
            conv.metadata->>'pipeline_stage',
            ql.q_metadata->>'pipeline_stage',
            CASE WHEN conv.assigned_operator_id IS NOT NULL OR conv.status = 'human_active' THEN 'in_contact' ELSE 'pending_contact' END
        ) = p_stage_filter
    )
  ORDER BY last_message_time DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_cockpit_leads(UUID, UUID, UUID, UUID, TEXT, TEXT) TO authenticated, service_role, anon;
