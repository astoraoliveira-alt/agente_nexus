-- ==============================================================================
-- MIGRATION: 20260925_sync_formalization_status_and_dashboard_rpc.sql
-- Descrição:
--   1. Sincroniza a RPC 'get_credit_campaign_funnel_stats' para reconhecer tanto
--      formalization_status ('in_service', 'waiting_contact', 'formalized')
--      quanto pipeline_stage ('in_contact', 'pending_contact', 'contract_signed').
--   2. Executa backfill em 'agent_leads' sincronizando leads cujas conversas
--      já foram assumidas por operadores ou movidas para 'in_contact'.
-- ==============================================================================

-- 1. Backfill de Sincronização em 'agent_leads' baseado nas conversas ativas
UPDATE public.agent_leads al
SET metadata = al.metadata || jsonb_build_object(
    'formalization_status', 'in_service',
    'pipeline_stage', 'in_contact',
    'pipeline_updated_at', NOW()
)
FROM public.conversations c
WHERE al.tenant_id = c.tenant_id
  AND (
    al.whatsapp = c.user_identifier
    OR al.whatsapp = RIGHT(c.user_identifier, 11)
    OR al.whatsapp = RIGHT(c.user_identifier, 10)
    OR c.user_identifier = '55' || al.whatsapp
    OR c.user_identifier = al.whatsapp
  )
  AND (
    c.status = 'human_active' 
    OR c.assigned_operator_id IS NOT NULL 
    OR (c.metadata->>'pipeline_stage') IN ('in_contact', 'proposal_sent')
  )
  AND lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('waiting_contact', 'aguar_contato', '');

-- 2. Atualizar a RPC com filtros de formalização completos
DROP FUNCTION IF EXISTS get_credit_campaign_funnel_stats(UUID, UUID[], TIMESTAMP WITH TIME ZONE, UUID);

CREATE OR REPLACE FUNCTION get_credit_campaign_funnel_stats(
  p_tenant_id UUID, 
  p_campaign_ids UUID[] DEFAULT NULL,
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_agent_id UUID DEFAULT NULL
)
RETURNS TABLE (
  campaign_id UUID,
  campaign_name TEXT,
  start_date TIMESTAMP WITH TIME ZONE,
  status TEXT,
  -- Bloco 1: Envio da Campanha
  carregados BIGINT,
  enviados BIGINT,
  entregues BIGINT,
  lidas BIGINT,
  interagiram BIGINT,
  -- Bloco 2: Funil de Venda
  faturamento BIGINT,
  valor_inicial BIGINT,
  opt_in BIGINT,
  aprovados BIGINT,
  recusados BIGINT,
  simularam BIGINT,
  ok_agente BIGINT,
  -- Bloco 3: Funil de Formalização
  aguar_contato BIGINT,
  em_atendimento BIGINT,
  formalizado BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH oq_metrics AS (
    SELECT
      c.id AS cid,
      c.name::text AS cname,
      COALESCE(c.start_date::timestamptz, c.created_at) AS cstart_date,
      c.status::text AS cstatus,
      COUNT(oq.id) AS m_carregados,
      COUNT(oq.id) FILTER (
        WHERE trim(lower(oq.status)) NOT IN ('queued', 'pending', 'scheduled', 'draft')
           OR COALESCE(oq.response_detected, false) = true
           OR trim(lower(oq.status)) = 'converted'
           OR (oq.metadata->>'converted') = 'true'
           OR oq.sent_at IS NOT NULL
      ) AS m_enviados,
      COUNT(oq.id) FILTER (
        WHERE trim(lower(oq.status)) IN ('sent', 'delivered', 'read', 'respondida', 'interagiu')
           OR COALESCE(oq.response_detected, false) = true
      ) AS m_entregues,
      COUNT(oq.id) FILTER (
        WHERE trim(lower(oq.status)) IN ('read', 'respondida', 'interagiu')
      ) AS m_lidas,
      COUNT(oq.id) FILTER (
        WHERE COALESCE(oq.response_detected, false) = true
           OR trim(lower(oq.status)) IN ('respondida', 'interagiu')
      ) AS m_interagiram
    FROM campaigns c
    LEFT JOIN outbound_queue oq ON oq.campaign_id = c.id
    WHERE c.tenant_id = p_tenant_id
      AND (p_campaign_ids IS NULL OR array_length(p_campaign_ids, 1) IS NULL OR c.id = ANY(p_campaign_ids))
      AND (p_start_date IS NULL OR c.created_at >= p_start_date)
      AND (p_agent_id IS NULL OR c.agent_id = p_agent_id)
    GROUP BY c.id, c.name, c.start_date, c.created_at, c.status
  ),
  lead_metrics AS (
    SELECT
      al.campaign_id AS l_cid,
      -- Bloco 2: Funil de Venda
      COUNT(al.id) FILTER (
        WHERE (al.metadata->>'revenue') IS NOT NULL 
           OR (al.metadata->>'faturamento') IS NOT NULL
      ) AS m_faturamento,
      COUNT(al.id) FILTER (
        WHERE (al.metadata->>'requested_amount') IS NOT NULL 
           OR (al.metadata->>'valor_inicial') IS NOT NULL
           OR (al.metadata->'simulation_data'->>'amount') IS NOT NULL
           OR NULLIF(al.metadata->>'fiserv_amount_approved', '') IS NOT NULL
      ) AS m_valor_inicial,
      COUNT(al.id) FILTER (
        WHERE (al.metadata->>'opt_in')::boolean = true
           OR (al.metadata->>'optin')::boolean = true
           OR (al.metadata->'consent'->>'opt_in')::boolean = true
           OR (al.metadata->>'fiserv_requested_at') IS NOT NULL
           OR (al.metadata->>'loan_request_id') IS NOT NULL
      ) AS m_opt_in,
      COUNT(al.id) FILTER (
        WHERE lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('approved', 'in_quoting', 'comite_approved')
           OR lower(COALESCE(al.status, '')) IN ('approved', 'aprovado')
      ) AS m_aprovados,
      COUNT(al.id) FILTER (
        WHERE lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('denied', 'fails_to_process', 'lost', 'cancelled')
           OR lower(COALESCE(al.status, '')) IN ('denied', 'recusado', 'reprovado')
      ) AS m_recusados,
      COUNT(al.id) FILTER (
        WHERE (al.metadata->>'simulation_requested')::boolean = true
           OR (al.metadata->>'simulation_data') IS NOT NULL
           OR (al.metadata->>'simularam')::boolean = true
      ) AS m_simularam,
      COUNT(al.id) FILTER (
        WHERE (al.metadata->>'simulation_accepted')::boolean = true
           OR (al.metadata->>'ok_agente')::boolean = true
      ) AS m_ok_agente,
      -- Bloco 3: Funil de Formalização (Lê formalization_status e pipeline_stage)
      COUNT(al.id) FILTER (
        WHERE (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('waiting_contact', 'aguar_contato', 'pending_docs')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) = 'pending_contact'
        )
        AND lower(COALESCE(al.metadata->>'formalization_status', '')) NOT IN ('in_service', 'em_atendimento', 'in_progress', 'formalization', 'formalized', 'formalizado', 'won', 'concluido', 'lost', 'cancelled', 'declined')
        AND lower(COALESCE(al.metadata->>'pipeline_stage', '')) NOT IN ('in_contact', 'proposal_sent', 'contract_signed', 'declined')
      ) AS m_aguar_contato,
      COUNT(al.id) FILTER (
        WHERE lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('in_service', 'em_atendimento', 'in_progress', 'formalization')
           OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) IN ('in_contact', 'proposal_sent')
      ) AS m_em_atendimento,
      COUNT(al.id) FILTER (
        WHERE lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('formalized', 'formalizado', 'won', 'concluido')
           OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) = 'contract_signed'
           OR lower(COALESCE(al.metadata->>'fiserv_status', '')) = 'won'
           OR (al.metadata->>'formalized_at') IS NOT NULL
      ) AS m_formalizado
    FROM agent_leads al
    WHERE al.tenant_id = p_tenant_id
      AND al.campaign_id IS NOT NULL
      AND (p_campaign_ids IS NULL OR array_length(p_campaign_ids, 1) IS NULL OR al.campaign_id = ANY(p_campaign_ids))
    GROUP BY al.campaign_id
  )
  SELECT
    oq.cid AS campaign_id,
    oq.cname AS campaign_name,
    oq.cstart_date AS start_date,
    oq.cstatus AS status,
    -- Bloco 1
    COALESCE(oq.m_carregados, 0) AS carregados,
    COALESCE(oq.m_enviados, 0) AS enviados,
    COALESCE(oq.m_entregues, 0) AS entregues,
    COALESCE(oq.m_lidas, 0) AS lidas,
    COALESCE(oq.m_interagiram, 0) AS interagiram,
    -- Bloco 2
    COALESCE(lm.m_faturamento, 0) AS faturamento,
    COALESCE(lm.m_valor_inicial, 0) AS valor_inicial,
    COALESCE(lm.m_opt_in, 0) AS opt_in,
    COALESCE(lm.m_aprovados, 0) AS aprovados,
    COALESCE(lm.m_recusados, 0) AS recusados,
    COALESCE(lm.m_simularam, 0) AS simularam,
    COALESCE(lm.m_ok_agente, 0) AS ok_agente,
    -- Bloco 3
    COALESCE(lm.m_aguar_contato, 0) AS aguar_contato,
    COALESCE(lm.m_em_atendimento, 0) AS em_atendimento,
    COALESCE(lm.m_formalizado, 0) AS formalizado
  FROM oq_metrics oq
  LEFT JOIN lead_metrics lm ON lm.l_cid = oq.cid
  ORDER BY oq.cstart_date DESC;
END;
$$;

NOTIFY pgrst, 'reload schema';
