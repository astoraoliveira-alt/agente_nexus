-- ============================================================
-- MIGRATION: 20261001_add_identity_confirmed_to_credit_funnel_stats.sql
-- Descrição: 
-- 1. Adiciona a coluna 'confirmaram' ao Funil de Venda (Bloco 2) antes de 'faturamento'
-- 2. Atualiza a RPC 'get_credit_campaign_funnel_stats' para contabilizar:
--    - Quem possui flag explícita de identidade/cnpj confirmado (identity_confirmed ou cnpj_confirmed)
--    - E retroativamente quem avançou pelos passos seguintes (faturamento, valor inicial, opt-in, simulação, etc)
-- 3. Atualiza 'fn_update_context_state' para persistir 'identity_confirmed = true' no 'agent_leads.metadata'
-- ============================================================

-- 1. Atualização da procedure fn_update_context_state
CREATE OR REPLACE FUNCTION public.fn_update_context_state(
    p_conversation_id UUID, 
    p_current_step TEXT, 
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_tenant_id UUID;
    v_user_phone TEXT;
    v_clean_phone TEXT;
    v_lead_id UUID;
    v_revenue NUMERIC;
    v_requested_amount NUMERIC;
    v_identity_confirmed BOOLEAN;
    v_new_lead_metadata JSONB;
BEGIN
    -- 1. Atualiza sempre a conversa (núcleo da função original)
    UPDATE public.conversations 
    SET context_state = jsonb_build_object(
        'current_step', p_current_step,
        'updated_at', NOW(),
        'metadata', COALESCE(p_metadata, '{}'::jsonb)
    )
    WHERE id = p_conversation_id
    RETURNING tenant_id, user_identifier INTO v_tenant_id, v_user_phone;

    -- Se a conversa não existir ou não tiver tenant, retorna com sucesso sem erro
    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('status', 'success', 'current_step', p_current_step, 'lead_updated', false);
    END IF;

    -- 2. Extrai com segurança revenue e requested_amount se existirem no payload
    BEGIN
        IF p_metadata ? 'revenue' AND NULLIF(p_metadata->>'revenue', '') IS NOT NULL THEN
            v_revenue := (p_metadata->>'revenue')::numeric;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_revenue := NULL;
    END;

    BEGIN
        IF p_metadata ? 'requested_amount' AND NULLIF(p_metadata->>'requested_amount', '') IS NOT NULL THEN
            v_requested_amount := (p_metadata->>'requested_amount')::numeric;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_requested_amount := NULL;
    END;

    -- Extrai confirmação de identidade (explícita via payload ou inferida pelos passos seguintes)
    IF (p_metadata->>'identity_confirmed') IN ('true', 't', '1') 
       OR (p_metadata->>'cnpj_confirmed') IN ('true', 't', '1')
       OR p_current_step IN ('coleta_faturamento', 'coleta_valor', 'consentimento_optin', 'criar_lead', 'apresenta_ofertas') THEN
        v_identity_confirmed := true;
    END IF;

    -- Se não há dados de faturamento, valor nem confirmação de identidade a sincronizar, encerra sem tocar em agent_leads
    IF v_revenue IS NULL AND v_requested_amount IS NULL AND v_identity_confirmed IS NULL THEN
        RETURN jsonb_build_object('status', 'success', 'current_step', p_current_step, 'lead_updated', false);
    END IF;

    -- 3. Localização defensiva do lead em agent_leads
    v_clean_phone := regexp_replace(COALESCE(v_user_phone, ''), '\D', '', 'g');

    BEGIN
        -- Tenta localizar o lead prioritariamente por CNPJ (se informado no metadata) ou pelo telefone
        IF p_metadata ? 'cnpj' AND NULLIF(p_metadata->>'cnpj', '') IS NOT NULL THEN
            SELECT id INTO v_lead_id
            FROM public.agent_leads
            WHERE tenant_id = v_tenant_id
              AND regexp_replace(identifier, '\D', '', 'g') = regexp_replace(p_metadata->>'cnpj', '\D', '', 'g')
            ORDER BY created_at DESC
            LIMIT 1;
        END IF;

        IF v_lead_id IS NULL AND v_clean_phone <> '' THEN
            SELECT id INTO v_lead_id
            FROM public.agent_leads
            WHERE tenant_id = v_tenant_id
              AND (
                whatsapp = v_clean_phone
                OR whatsapp = RIGHT(v_clean_phone, 11)
                OR whatsapp = RIGHT(v_clean_phone, 10)
                OR regexp_replace(whatsapp, '^55', '') = regexp_replace(v_clean_phone, '^55', '')
              )
            ORDER BY created_at DESC
            LIMIT 1;
        END IF;

        -- 4. Se o lead foi encontrado, realiza o merge defensivo preservando simulações/formalizações
        IF v_lead_id IS NOT NULL THEN
            -- Monta apenas as chaves fornecidas
            v_new_lead_metadata := '{}'::jsonb;

            IF v_identity_confirmed = true THEN
                v_new_lead_metadata := v_new_lead_metadata || jsonb_build_object(
                    'identity_confirmed', true,
                    'cnpj_confirmed', true,
                    'identity_confirmed_at', COALESCE((SELECT metadata->>'identity_confirmed_at' FROM public.agent_leads WHERE id = v_lead_id), NOW()::text)
                );
            END IF;
            
            IF v_revenue IS NOT NULL THEN
                v_new_lead_metadata := v_new_lead_metadata || jsonb_build_object('revenue', v_revenue);
            END IF;

            IF v_requested_amount IS NOT NULL THEN
                -- NOTA: Atualiza apenas o requested_amount (intenção inicial).
                -- NÃO toca em simulation_data, nem em formalization_status ou fiserv_status.
                v_new_lead_metadata := v_new_lead_metadata || jsonb_build_object('requested_amount', v_requested_amount);
            END IF;

            UPDATE public.agent_leads
            SET metadata = COALESCE(metadata, '{}'::jsonb) || v_new_lead_metadata
            WHERE id = v_lead_id;

            RETURN jsonb_build_object('status', 'success', 'current_step', p_current_step, 'lead_updated', true);
        END IF;

    EXCEPTION WHEN OTHERS THEN
        -- Proteção absoluta: qualquer falha em lidar com agent_leads é silenciada
        -- garantindo que o fluxo conversacional do agente nunca seja interrompido
        RETURN jsonb_build_object('status', 'success', 'current_step', p_current_step, 'lead_updated', false, 'warning', SQLERRM);
    END;

    RETURN jsonb_build_object('status', 'success', 'current_step', p_current_step, 'lead_updated', false);
END;
$function$;

-- 2. Atualização da RPC get_credit_campaign_funnel_stats
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
        WHERE COALESCE(oq.response_detected, false) = true
           OR (oq.metadata->>'responded') = 'true'
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
        WHERE (al.metadata->>'identity_confirmed') IN ('true', 't', '1')
           OR (al.metadata->>'cnpj_confirmed') IN ('true', 't', '1')
           OR (al.metadata->>'revenue') IS NOT NULL 
           OR (al.metadata->>'faturamento') IS NOT NULL
           OR (al.metadata->>'requested_amount') IS NOT NULL 
           OR (al.metadata->>'valor_inicial') IS NOT NULL
           OR (al.metadata->'simulation_data'->>'amount') IS NOT NULL
           OR NULLIF(al.metadata->>'fiserv_amount_approved', '') IS NOT NULL
           OR (al.metadata->>'opt_in')::boolean = true
           OR (al.metadata->>'optin')::boolean = true
           OR (al.metadata->'consent'->>'opt_in')::boolean = true
           OR (al.metadata->>'fiserv_requested_at') IS NOT NULL
           OR (al.metadata->>'loan_request_id') IS NOT NULL
      ) AS m_confirmaram,
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
      -- Bloco 3: Funil de Formalização (Rigorosamente condicionado a ter dado OK na simulação)
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
    COALESCE(oq.m_interagiram, 0) AS interagiram,
    -- Bloco 2
    COALESCE(lm.m_confirmaram, 0) AS confirmaram,
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
    COALESCE(lm.m_formalizado, 0) AS formalizado,
    COALESCE(lm.m_desistencia, 0) AS desistencia
  FROM oq_metrics oq
  LEFT JOIN lead_metrics lm ON lm.l_cid = oq.cid
  ORDER BY oq.cstart_date DESC;
END;
$$;
