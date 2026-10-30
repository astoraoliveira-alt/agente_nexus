-- ============================================================
-- MIGRATION: 20261030_add_em_analise_to_credit_funnel_stats.sql
-- Descrição:
-- 1. Adiciona a coluna 'em_analise' (BIGINT) no Bloco 2 (Funil de Venda) da RPC 'get_credit_campaign_funnel_stats'.
-- 2. Garante a invariante matemática estrita do funil de crédito:
--      opt_in = em_analise + aprovados + recusados
-- 3. 'em_analise' contabiliza leads que realizaram Opt-in formal (ou possuem loan_request_id na Fiserv)
--    e que ainda se encontram em processamento pela mesa de crédito Fiserv ('in_progress', 'in_quoting', 'comite'),
--    sem desfecho final de Aprovado nem Recusado.
-- ============================================================

BEGIN;

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
  confirmaram BIGINT,
  faturamento BIGINT,
  valor_inicial BIGINT,
  opt_in BIGINT,
  em_analise BIGINT,
  aprovados BIGINT,
  recusados BIGINT,
  simularam BIGINT,
  ok_agente BIGINT,
  -- Bloco 3: Funil de Formalização
  aguar_contato BIGINT,
  em_atendimento BIGINT,
  formalizado BIGINT,
  desistencia BIGINT
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
        WHERE trim(lower(oq.status)) IN ('sent', 'enviada', 'delivered', 'read', 'respondida', 'convertida', 'entregue', 'lida', 'recebida', 'interagiu')
           OR COALESCE(oq.response_detected, false) = true
           OR trim(lower(oq.status)) = 'converted'
           OR (oq.metadata->>'converted') = 'true'
      ) AS m_entregues,
      COUNT(oq.id) FILTER (
        WHERE trim(lower(oq.status)) IN ('read', 'respondida', 'convertida', 'lida', 'recebida', 'interagiu')
           OR COALESCE(oq.response_detected, false) = true
           OR trim(lower(oq.status)) = 'converted'
           OR (oq.metadata->>'converted') = 'true'
      ) AS m_lidas,
      COUNT(oq.id) FILTER (
        WHERE (
          COALESCE(oq.response_detected, false) = true
          OR (oq.metadata->>'responded') = 'true'
          OR trim(lower(oq.status)) IN ('respondida', 'interagiu')
          OR COALESCE((oq.metadata->>'human_interaction')::boolean, false) = true
        )
        AND NOT (
          (COALESCE((oq.metadata->>'is_auto_reply')::boolean, false) = true
           OR COALESCE((oq.metadata->>'is_bot')::boolean, false) = true)
          AND COALESCE((oq.metadata->>'human_interaction')::boolean, false) = false
        )
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
      
      -- 1. Confirmaram
      COUNT(al.id) FILTER (
        WHERE (al.metadata->>'identity_confirmed') IN ('true', 't', '1')
           OR (al.metadata->>'cnpj_confirmed') IN ('true', 't', '1')
           OR (
             (al.metadata->>'requested_amount') ~ '^[0-9]+(\.[0-9]+)?$' 
             AND length(regexp_replace(al.metadata->>'requested_amount', '\..*$', '')) <= 6
             AND (al.metadata->>'requested_amount')::numeric BETWEEN 10000 AND 500000
           )
           OR (
             (al.metadata->>'valor_inicial') ~ '^[0-9]+(\.[0-9]+)?$' 
             AND length(regexp_replace(al.metadata->>'valor_inicial', '\..*$', '')) <= 6
             AND (al.metadata->>'valor_inicial')::numeric BETWEEN 10000 AND 500000
           )
           OR (al.metadata->'simulation_data'->>'amount') IS NOT NULL
           OR NULLIF(al.metadata->>'fiserv_amount_approved', '') IS NOT NULL
           OR (al.metadata->>'revenue') IS NOT NULL 
           OR (al.metadata->>'faturamento') IS NOT NULL
           OR (al.metadata->>'opt_in')::boolean = true
           OR (al.metadata->>'optin')::boolean = true
           OR (al.metadata->'consent'->>'opt_in')::boolean = true
           OR (al.metadata->>'fiserv_requested_at') IS NOT NULL
           OR (al.metadata->>'loan_request_id') IS NOT NULL
           OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('approved', 'in_quoting', 'comite_approved', 'denied', 'fails_to_process', 'lost', 'cancelled')
           OR lower(COALESCE(al.status, '')) IN ('approved', 'aprovado', 'denied', 'recusado', 'reprovado')
      ) AS m_confirmaram,

      -- 2. Valor Inicial
      COUNT(al.id) FILTER (
        WHERE (
          (
            (al.metadata->>'requested_amount') ~ '^[0-9]+(\.[0-9]+)?$' 
            AND length(regexp_replace(al.metadata->>'requested_amount', '\..*$', '')) <= 6
            AND (al.metadata->>'requested_amount')::numeric BETWEEN 10000 AND 500000
          )
          OR (
            (al.metadata->>'valor_inicial') ~ '^[0-9]+(\.[0-9]+)?$' 
            AND length(regexp_replace(al.metadata->>'valor_inicial', '\..*$', '')) <= 6
            AND (al.metadata->>'valor_inicial')::numeric BETWEEN 10000 AND 500000
          )
          OR (al.metadata->'simulation_data'->>'amount') IS NOT NULL
          OR NULLIF(al.metadata->>'fiserv_amount_approved', '') IS NOT NULL
          OR (al.metadata->>'revenue') IS NOT NULL 
          OR (al.metadata->>'faturamento') IS NOT NULL
          OR (al.metadata->>'opt_in')::boolean = true
          OR (al.metadata->>'optin')::boolean = true
          OR (al.metadata->'consent'->>'opt_in')::boolean = true
          OR (al.metadata->>'fiserv_requested_at') IS NOT NULL
          OR (al.metadata->>'loan_request_id') IS NOT NULL
          OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('approved', 'in_quoting', 'comite_approved', 'denied', 'fails_to_process', 'lost', 'cancelled')
          OR lower(COALESCE(al.status, '')) IN ('approved', 'aprovado', 'denied', 'recusado', 'reprovado')
        )
      ) AS m_valor_inicial,

      -- 3. Faturamento
      COUNT(al.id) FILTER (
        WHERE (al.metadata->>'revenue') IS NOT NULL 
           OR (al.metadata->>'faturamento') IS NOT NULL
           OR (al.metadata->>'opt_in')::boolean = true
           OR (al.metadata->>'optin')::boolean = true
           OR (al.metadata->'consent'->>'opt_in')::boolean = true
           OR (al.metadata->>'fiserv_requested_at') IS NOT NULL
           OR (al.metadata->>'loan_request_id') IS NOT NULL
           OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('approved', 'in_quoting', 'comite_approved', 'denied', 'fails_to_process', 'lost', 'cancelled')
           OR lower(COALESCE(al.status, '')) IN ('approved', 'aprovado', 'denied', 'recusado', 'reprovado')
      ) AS m_faturamento,

      -- 4. Opt-in
      COUNT(al.id) FILTER (
        WHERE (al.metadata->>'opt_in')::boolean = true
           OR (al.metadata->>'optin')::boolean = true
           OR (al.metadata->'consent'->>'opt_in')::boolean = true
           OR (al.metadata->>'fiserv_requested_at') IS NOT NULL
           OR (al.metadata->>'loan_request_id') IS NOT NULL
           OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('approved', 'in_quoting', 'comite_approved', 'denied', 'fails_to_process', 'lost', 'cancelled')
           OR lower(COALESCE(al.status, '')) IN ('approved', 'aprovado', 'denied', 'recusado', 'reprovado')
      ) AS m_opt_in,

      -- 5. Aprovados (Fiserv - Mantém pré-aprovados e aprovados)
      COUNT(al.id) FILTER (
        WHERE NOT (
          (al.metadata->>'lost_reason') IS NOT NULL
          OR lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'recusado', 'desistente')
          OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('denied', 'fails_to_process', 'lost', 'cancelled', 'recusado', 'reprovado', 'declined')
          OR lower(COALESCE(al.status, '')) IN ('denied', 'recusado', 'reprovado')
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%não conseguimos%'
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%nao conseguimos%'
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%reprovad%'
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%recusad%'
        )
        AND (
          lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('approved', 'comite_approved', 'aprovado', 'pre_approved')
          OR lower(COALESCE(al.status, '')) IN ('approved', 'aprovado')
          OR (al.metadata->>'fiserv_is_approved')::boolean = true
          OR (al.metadata->>'fiserv_amount_approved' IS NOT NULL AND al.metadata->>'fiserv_amount_approved' ~ '^[0-9]+(\.[0-9]+)?$' AND (al.metadata->>'fiserv_amount_approved')::numeric > 0)
        )
      ) AS m_aprovados,

      -- 6. Recusados (Fiserv)
      COUNT(al.id) FILTER (
        WHERE (al.metadata->>'lost_reason') IS NOT NULL
           OR lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'recusado', 'desistente')
           OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('denied', 'fails_to_process', 'lost', 'cancelled', 'recusado', 'reprovado', 'declined')
           OR lower(COALESCE(al.status, '')) IN ('denied', 'recusado', 'reprovado')
           OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%não conseguimos%'
           OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%nao conseguimos%'
           OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%reprovad%'
           OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%recusad%'
      ) AS m_recusados,

      -- 7. Em Análise:
      -- Leads com Opt-in que ainda NÃO possuem desfecho de Aprovado nem Recusado
      COUNT(al.id) FILTER (
        WHERE (
          (al.metadata->>'opt_in')::boolean = true
          OR (al.metadata->>'optin')::boolean = true
          OR (al.metadata->'consent'->>'opt_in')::boolean = true
          OR (al.metadata->>'fiserv_requested_at') IS NOT NULL
          OR (al.metadata->>'loan_request_id') IS NOT NULL
          OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('approved', 'in_quoting', 'comite_approved', 'denied', 'fails_to_process', 'lost', 'cancelled')
          OR lower(COALESCE(al.status, '')) IN ('approved', 'aprovado', 'denied', 'recusado', 'reprovado')
        )
        -- NÃO é Aprovado
        AND NOT (
          NOT (
            (al.metadata->>'lost_reason') IS NOT NULL
            OR lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'recusado', 'desistente')
            OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('denied', 'fails_to_process', 'lost', 'cancelled', 'recusado', 'reprovado', 'declined')
            OR lower(COALESCE(al.status, '')) IN ('denied', 'recusado', 'reprovado')
            OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%não conseguimos%'
            OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%nao conseguimos%'
            OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%reprovad%'
            OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%recusad%'
          )
          AND (
            lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('approved', 'comite_approved', 'aprovado', 'pre_approved')
            OR lower(COALESCE(al.status, '')) IN ('approved', 'aprovado')
            OR (al.metadata->>'fiserv_is_approved')::boolean = true
            OR (al.metadata->>'fiserv_amount_approved' IS NOT NULL AND al.metadata->>'fiserv_amount_approved' ~ '^[0-9]+(\.[0-9]+)?$' AND (al.metadata->>'fiserv_amount_approved')::numeric > 0)
          )
        )
        -- NÃO é Recusado
        AND NOT (
          (al.metadata->>'lost_reason') IS NOT NULL
          OR lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'recusado', 'desistente')
          OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('denied', 'fails_to_process', 'lost', 'cancelled', 'recusado', 'reprovado', 'declined')
          OR lower(COALESCE(al.status, '')) IN ('denied', 'recusado', 'reprovado')
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%não conseguimos%'
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%nao conseguimos%'
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%reprovad%'
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%recusad%'
        )
      ) AS m_em_analise,

      -- 8. Simularam (Com proposta calculada de parcelas/juros)
      COUNT(al.id) FILTER (
        WHERE NOT (
          (al.metadata->>'lost_reason') IS NOT NULL
          OR lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'recusado', 'desistente')
          OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('denied', 'fails_to_process', 'lost', 'cancelled', 'recusado', 'reprovado', 'declined')
          OR lower(COALESCE(al.status, '')) IN ('denied', 'recusado', 'reprovado')
        )
        AND (
          (al.metadata->'simulation_data'->>'installment_value') IS NOT NULL
          OR (al.metadata->'simulation_data'->>'installments') IS NOT NULL
          OR (al.metadata->'simulation_data'->>'monthly_interest') IS NOT NULL
          OR (
            (al.metadata->>'simularam')::boolean = true
            AND lower(COALESCE(al.metadata->>'fiserv_last_status', '')) = 'success'
          )
          OR (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'ok_agente')::boolean = true
          OR (al.metadata->'accepted_proposal') IS NOT NULL
          OR (al.metadata->>'formalized_at') IS NOT NULL
        )
      ) AS m_simularam,

      -- 9. Ok Agente (Aceite da Proposta Simulada)
      COUNT(al.id) FILTER (
        WHERE NOT (
          (al.metadata->>'lost_reason') IS NOT NULL
          OR lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'recusado', 'desistente')
          OR lower(COALESCE(al.metadata->>'fiserv_status', '')) IN ('denied', 'fails_to_process', 'lost', 'cancelled', 'recusado', 'reprovado', 'declined')
          OR lower(COALESCE(al.status, '')) IN ('denied', 'recusado', 'reprovado')
        )
        AND (
          (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'ok_agente')::boolean = true
          OR (al.metadata->'accepted_proposal') IS NOT NULL
          OR (al.metadata->>'formalized_at') IS NOT NULL
        )
      ) AS m_ok_agente,

      -- Bloco 3: Funil de Formalização (Opção A: Inclui Transbordos Iniciais e Solicitações de Especialista)
      
      -- 10. Aguardando Contato:
      -- Aceitou proposta OU solicitou especialista/handoff, ainda não iniciado atendimento humano
      COUNT(al.id) FILTER (
        WHERE (
          (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'ok_agente')::boolean = true
          OR (al.metadata->'accepted_proposal') IS NOT NULL
          OR (al.metadata->>'formalized_at') IS NOT NULL
          OR (al.metadata->>'handoff_requested')::boolean = true
          OR (al.metadata->>'falar_agente')::boolean = true
          OR lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('waiting_contact', 'aguar_contato')
        )
        AND NOT (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'desistente', 'recusado')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) IN ('declined', 'lost')
          OR lower(COALESCE(al.status, '')) IN ('lost', 'cancelled', 'declined')
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%desistiu%'
          OR (al.metadata->>'decline_at') IS NOT NULL
          OR (al.metadata->>'decline_reason') IS NOT NULL
        )
        AND NOT (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('formalized', 'formalizado', 'won', 'concluido')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) = 'contract_signed'
          OR lower(COALESCE(al.metadata->>'fiserv_status', '')) = 'won'
          OR (al.metadata->>'formalized_at') IS NOT NULL
        )
        AND NOT (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('in_service', 'em_atendimento', 'in_progress', 'formalization')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) IN ('in_contact', 'proposal_sent')
        )
      ) AS m_aguar_contato,

      -- 11. Em Atendimento:
      -- Aceitou proposta OU solicitou especialista e está ativamente em contato com operador
      COUNT(al.id) FILTER (
        WHERE (
          (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'ok_agente')::boolean = true
          OR (al.metadata->'accepted_proposal') IS NOT NULL
          OR (al.metadata->>'formalized_at') IS NOT NULL
          OR (al.metadata->>'handoff_requested')::boolean = true
          OR (al.metadata->>'falar_agente')::boolean = true
          OR lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('waiting_contact', 'aguar_contato', 'in_service', 'em_atendimento')
        )
        AND NOT (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'desistente', 'recusado')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) IN ('declined', 'lost')
          OR lower(COALESCE(al.status, '')) IN ('lost', 'cancelled', 'declined')
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%desistiu%'
          OR (al.metadata->>'decline_at') IS NOT NULL
          OR (al.metadata->>'decline_reason') IS NOT NULL
        )
        AND NOT (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('formalized', 'formalizado', 'won', 'concluido')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) = 'contract_signed'
          OR lower(COALESCE(al.metadata->>'fiserv_status', '')) = 'won'
          OR (al.metadata->>'formalized_at') IS NOT NULL
        )
        AND (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('in_service', 'em_atendimento', 'in_progress', 'formalization')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) IN ('in_contact', 'proposal_sent')
        )
      ) AS m_em_atendimento,

      -- 12. Formalizado:
      COUNT(al.id) FILTER (
        WHERE (
          (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'ok_agente')::boolean = true
          OR (al.metadata->'accepted_proposal') IS NOT NULL
          OR (al.metadata->>'formalized_at') IS NOT NULL
        )
        AND NOT (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'desistente', 'recusado')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) IN ('declined', 'lost')
          OR lower(COALESCE(al.status, '')) IN ('lost', 'cancelled', 'declined')
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%desistiu%'
          OR (al.metadata->>'decline_at') IS NOT NULL
          OR (al.metadata->>'decline_reason') IS NOT NULL
        )
        AND (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('formalized', 'formalizado', 'won', 'concluido')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) = 'contract_signed'
          OR lower(COALESCE(al.metadata->>'fiserv_status', '')) = 'won'
          OR (al.metadata->>'formalized_at') IS NOT NULL
        )
      ) AS m_formalizado,

      -- 13. Desistência: Exclusivo para o FIM DO FUNIL (formalização)
      COUNT(al.id) FILTER (
        WHERE (
          (al.metadata->>'simulation_accepted')::boolean = true
          OR (al.metadata->>'ok_agente')::boolean = true
          OR (al.metadata->'accepted_proposal') IS NOT NULL
          OR (al.metadata->>'formalized_at') IS NOT NULL
        )
        AND (
          lower(COALESCE(al.metadata->>'formalization_status', '')) IN ('lost', 'cancelled', 'declined', 'desistente', 'recusado')
          OR lower(COALESCE(al.metadata->>'pipeline_stage', '')) IN ('declined', 'lost')
          OR lower(COALESCE(al.status, '')) IN ('lost', 'cancelled', 'declined')
          OR lower(COALESCE(al.metadata->>'fiserv_external_status', '')) ILIKE '%desistiu%'
          OR (al.metadata->>'decline_at') IS NOT NULL
          OR (al.metadata->>'decline_reason') IS NOT NULL
        )
      ) AS m_desistencia
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
    GREATEST(COALESCE(oq.m_interagiram, 0), COALESCE(lm.m_confirmaram, 0)) AS interagiram,
    -- Bloco 2
    COALESCE(lm.m_confirmaram, 0) AS confirmaram,
    COALESCE(lm.m_faturamento, 0) AS faturamento,
    COALESCE(lm.m_valor_inicial, 0) AS valor_inicial,
    COALESCE(lm.m_opt_in, 0) AS opt_in,
    COALESCE(lm.m_em_analise, 0) AS em_analise,
    COALESCE(lm.m_aprovados, 0) AS aprovados,
    COALESCE(lm.m_recusados, 0) AS recusados,
    COALESCE(lm.m_simularam, 0) AS simularam,
    COALESCE(lm.m_ok_agente, 0) AS ok_agente,
    -- Bloco 3
    COALESCE(lm.m_aguar_contato, 0) AS aguar_contato,
    COALESCE(lm.m_em_atendimento, 0) AS em_atendimento,
    COALESCE(lm.m_formalizado, 0) AS formalizado,
    COALESCE(lm.m_desistencia, 0) AS desistencia
  FROM oq_metrics oq
  LEFT JOIN lead_metrics lm ON lm.l_cid = oq.cid
  ORDER BY oq.cstart_date DESC;
END;
$$;

-- Permissões explícitas de execução
GRANT EXECUTE ON FUNCTION get_credit_campaign_funnel_stats(UUID, UUID[], TIMESTAMP WITH TIME ZONE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_credit_campaign_funnel_stats(UUID, UUID[], TIMESTAMP WITH TIME ZONE, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_credit_campaign_funnel_stats(UUID, UUID[], TIMESTAMP WITH TIME ZONE, UUID) TO anon;

COMMIT;

-- Recarregar cache de schema do PostgREST
NOTIFY pgrst, 'reload schema';

