-- ============================================================
-- MIGRATION: 20260922_safe_sync_context_to_agent_leads.sql
-- Descrição: Atualiza a RPC fn_update_context_state para sincronizar
-- de forma segura e defensiva o faturamento (revenue) e o valor inicial
-- (requested_amount) na tabela agent_leads quando presentes em p_metadata.
-- 
-- GARANTIAS DE ROBUSTEZ:
-- 1. Se a conversa não tiver lead vinculado (outro agente ou contato avulso),
--    NUNCA quebra e executa a atualização de conversations normalmente.
-- 2. Preserva integralmente dados de simulações posteriores (simulation_data)
--    e status de formalização (formalization_status / fiserv_status).
-- 3. Usa tratamento de exceções (EXCEPTION WHEN OTHERS) para blindar a execução.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_update_context_state(
    p_conversation_id UUID,
    p_current_step TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_user_phone TEXT;
    v_clean_phone TEXT;
    v_lead_id UUID;
    v_revenue NUMERIC;
    v_requested_amount NUMERIC;
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

    -- Se não há dados de faturamento nem valor a sincronizar, encerra sem tocar em agent_leads
    IF v_revenue IS NULL AND v_requested_amount IS NULL THEN
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
$$;

GRANT EXECUTE ON FUNCTION public.fn_update_context_state(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_update_context_state(UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_update_context_state(UUID, TEXT, JSONB) TO anon;
