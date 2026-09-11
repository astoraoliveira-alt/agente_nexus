-- ============================================================
-- MIGRATION: Fiserv Funnel Multi-Step & Hybrid Handoff
-- Date: 2026-08-04
-- Tenant Target: Multi-tenant (Edenred & Fiserv support)
-- ============================================================

-- 1. ATUALIZAÇÃO DA RPC DO FUNIL EDENRED / FISERV
-- Suporta o funil nativo em 4 passos:
-- Passo 1 (Conversão Edenred): Solicitação de Análise / Opt-In LGPD (fiserv_step1_requested_at) OU mensagem com link fiservcapital (legado)
-- Passo 2: Crédito Aprovado (fiserv_step2_status = 'approved')
-- Passo 3: Simulação Efetuada (fiserv_step3_simulated_at)
-- Passo 4 (Conversão Fiserv): Proposta Aceita & Pedido de Atendente (fiserv_step4_confirmed_at)

CREATE OR REPLACE FUNCTION get_edenred_conversion_funnel(
  p_tenant_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_contacts       BIGINT := 0;
  v_step1_edenred_count  BIGINT := 0;
  v_step2_approved_count BIGINT := 0;
  v_step3_simulated_count BIGINT := 0;
  v_step4_fiserv_count   BIGINT := 0;

  v_edenred_rate NUMERIC := 0;
  v_fiserv_rate  NUMERIC := 0;
BEGIN
  -- 1. Total de contatos únicos em conversas no tenant
  SELECT COUNT(DISTINCT c.user_identifier)
  INTO   v_total_contacts
  FROM   conversations c
  WHERE  c.tenant_id = p_tenant_id
    AND  c.user_identifier IS NOT NULL;

  -- 2. Passo 1 (Conversão Edenred): Leads com opt-in/análise solicitada OU mensagens com link fiservcapital
  SELECT COUNT(DISTINCT l.id)
  INTO   v_step1_edenred_count
  FROM   agent_leads l
  WHERE  l.tenant_id = p_tenant_id
    AND  (
      (l.metadata->>'fiserv_step1_requested_at') IS NOT NULL
      OR (l.metadata->>'loan_request_id') IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM conversations c
        JOIN messages m ON m.conversation_id = c.id
        WHERE c.tenant_id = p_tenant_id
          AND (c.user_identifier = l.identifier OR c.user_identifier = l.whatsapp)
          AND m.sender_type IN ('ai', 'bot', 'assistant', 'lia', 'system')
          AND m.content ILIKE '%fiservcapital%'
      )
    );

  -- 3. Passo 2: Crédito Aprovado na Fiserv
  SELECT COUNT(DISTINCT l.id)
  INTO   v_step2_approved_count
  FROM   agent_leads l
  WHERE  l.tenant_id = p_tenant_id
    AND  (
      (l.metadata->>'fiserv_step2_status') = 'approved'
      OR (l.metadata->>'fiserv_status') IN ('approved', 'comite_approved', 'won', 'formalization')
    );

  -- 4. Passo 3: Simulação Efetuada no Chat
  SELECT COUNT(DISTINCT l.id)
  INTO   v_step3_simulated_count
  FROM   agent_leads l
  WHERE  l.tenant_id = p_tenant_id
    AND  (l.metadata->>'fiserv_step3_simulated_at') IS NOT NULL;

  -- 5. Passo 4 (Conversão Fiserv): Proposta Aceita e Pedido de Atendente
  SELECT COUNT(DISTINCT l.id)
  INTO   v_step4_fiserv_count
  FROM   agent_leads l
  WHERE  l.tenant_id = p_tenant_id
    AND  (
      (l.metadata->>'fiserv_step4_confirmed_at') IS NOT NULL
      OR (l.metadata->>'fiserv_confirmed_at') IS NOT NULL
    );

  -- 6. Cálculo das taxas de conversão
  v_edenred_rate := CASE
    WHEN v_total_contacts = 0 THEN 0
    ELSE ROUND((v_step1_edenred_count::NUMERIC / v_total_contacts) * 100, 1)
  END;

  v_fiserv_rate := CASE
    WHEN v_total_contacts = 0 THEN 0
    ELSE ROUND((v_step4_fiserv_count::NUMERIC / v_total_contacts) * 100, 1)
  END;

  RETURN json_build_object(
    'total_contacts',           v_total_contacts,
    'link_sent_contacts',        v_step1_edenred_count, -- Retrocompatibilidade (Edenred Conv)
    'conversion_rate',          v_edenred_rate,         -- Retrocompatibilidade (Edenred Rate)
    'step1_analysis_requested', v_step1_edenred_count,
    'step2_credit_approved',    v_step2_approved_count,
    'step3_simulation_done',    v_step3_simulated_count,
    'step4_proposal_confirmed', v_step4_fiserv_count,
    'edenred_conversion_rate',  v_edenred_rate,
    'fiserv_conversion_rate',   v_fiserv_rate
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_edenred_conversion_funnel(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_edenred_conversion_funnel(UUID) TO service_role;


-- 2. RPC DE DISPARO DE HANDOFF HÍBRIDO (PLATAFORMA + METADATA PASSO 4)
CREATE OR REPLACE FUNCTION public.trigger_fiserv_handoff(
    p_tenant_id UUID,
    p_conversation_id UUID,
    p_campaign_id UUID DEFAULT NULL,
    p_lead_id UUID DEFAULT NULL,
    p_initial_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_handoff_id UUID;
BEGIN
    -- 1. Insere a solicitação na fila do Handoff Hub
    INSERT INTO public.handoff_requests (
        tenant_id,
        conversation_id,
        campaign_id,
        lead_id,
        initial_message,
        metadata,
        status,
        requested_at
    ) VALUES (
        p_tenant_id,
        p_conversation_id,
        p_campaign_id,
        p_lead_id,
        p_initial_message,
        p_metadata,
        'pending',
        now()
    )
    RETURNING id INTO v_handoff_id;

    -- 2. Atualiza o status da conversa para human_active (habilita atendimento humano)
    UPDATE public.conversations
    SET status = 'human_active',
        updated_at = now()
    WHERE id = p_conversation_id
      AND tenant_id = p_tenant_id;

    -- 3. Atualiza agent_leads.metadata carimbando o Passo 4 (Conversão Fiserv)
    IF p_lead_id IS NOT NULL THEN
        UPDATE public.agent_leads
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'fiserv_step4_confirmed_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'fiserv_confirmed_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'fiserv_status', 'handoff_requested'
        )
        WHERE id = p_lead_id
          AND tenant_id = p_tenant_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'handoff_id', v_handoff_id,
        'status', 'human_active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.trigger_fiserv_handoff(UUID, UUID, UUID, UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_fiserv_handoff(UUID, UUID, UUID, UUID, TEXT, JSONB) TO service_role;
