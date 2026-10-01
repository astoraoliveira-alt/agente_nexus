-- ====================================================================
-- MIGRATION: 20261001_get_sales_cockpit_leads
-- Descrição: Cria a RPC oficial 'get_sales_cockpit_leads' para o Cockpit de Vendas.
-- Baseado 100% no critério da coluna "OK Agente" do Dashboard Executivo
-- (simulation_accepted = true OU ok_agente = true OU accepted_proposal IS NOT NULL).
-- Retorna os dados cadastrais, proposta aceita, operador e o histórico completo de mensagens (JSONB).
-- ====================================================================

DROP FUNCTION IF EXISTS get_sales_cockpit_leads(UUID, UUID, UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_sales_cockpit_leads(
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
      -- 🎯 CRITÉRIO OFICIAL "OK AGENTE" DO DASHBOARD:
      AND (
          (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'ok_agente')::boolean = true
          OR al.metadata->'accepted_proposal' IS NOT NULL
      )
      -- Validações de integridade da campanha
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
    COALESCE(conv.total_messages, 0)::bigint AS total_messages,
    conv.last_message_content::text AS last_message_content,
    COALESCE(conv.last_message_at, ql.q_created_at) AS last_message_time,
    COALESCE(conv.messages_agg, '[]'::jsonb) AS messages
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
      c.user_name,
      (
        SELECT m.content 
        FROM messages m 
        WHERE m.conversation_id = c.id 
        ORDER BY m.created_at DESC 
        LIMIT 1
      ) AS last_message_content,
      (
        SELECT count(*) 
        FROM messages m 
        WHERE m.conversation_id = c.id
      ) AS total_messages,
      (
        SELECT COALESCE(
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
        )
        FROM (
          SELECT *
          FROM messages m_inner
          WHERE m_inner.conversation_id = c.id
          ORDER BY m_inner.created_at ASC
          LIMIT 100
        ) m_sub
      ) AS messages_agg
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
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) DESC,
      c.last_message_at DESC NULLS LAST,
      c.created_at DESC
    LIMIT 1
  ) conv ON true
  LEFT JOIN users u ON u.id = COALESCE(conv.assigned_operator_id, (ql.q_metadata->>'operator_id')::uuid)
  WHERE 
    -- RBAC: Administradores e Super Admins veem tudo; operadores veem livres ou atribuídos a eles
    (
        p_user_role IN ('super_admin', 'admin', 'tenant_admin', 'administrador')
        OR (
            (conv.assigned_operator_id IS NULL AND COALESCE(conv.metadata->>'pipeline_stage', ql.q_metadata->>'pipeline_stage', 'pending_contact') = 'pending_contact')
            OR conv.assigned_operator_id = p_user_id
            OR (ql.q_metadata->>'operator_id')::uuid = p_user_id
        )
    )
    -- Filtro de etapa do funil
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
