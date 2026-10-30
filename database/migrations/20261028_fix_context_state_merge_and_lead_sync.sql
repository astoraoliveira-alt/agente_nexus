-- ============================================================
-- MIGRATION: 20261028_fix_context_state_merge_and_lead_sync.sql
-- Descrição:
-- 1. Mantém 100% da estrutura e assinatura original de `fn_update_context_state(p_conversation_id UUID, p_current_step TEXT, p_metadata JSONB)`
--    criada em `20261001_add_identity_confirmed_to_credit_funnel_stats.sql`.
-- 2. Faz MERGE defensivo em `conversations.context_state` (usando `||`) para nunca apagar chaves existentes (como `cnpj_confirmed`, `last_intent`, `flags`).
-- 3. Faz MERGE defensivo em `fn_update_conversation_state(p_conversation_id UUID, p_new_state JSONB)` para não sobrescrever `current_step` e `metadata` quando salva `last_intent`.
-- 4. Persiste também `requested_installments`, `opt_in` e `consent` em `agent_leads.metadata` quando enviados em `p_metadata`, e nunca marca `identity_confirmed = true` quando `p_current_step = 'stop_flow'`.
-- ============================================================

BEGIN;

-- 0. Garante que a coluna funnel_step exista fisicamente em public.conversations para compatibilidade retroativa
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS funnel_step TEXT;

-- 1. Remove a sobrecarga de 2 parâmetros e atualiza a assinatura original de 4 parâmetros (com DEFAULT NULL)
--    para evitar erro PGRST203 no PostgREST e preservar context_state anterior via merge JSONB
DROP FUNCTION IF EXISTS public.fn_update_conversation_state(UUID, JSONB);

CREATE OR REPLACE FUNCTION public.fn_update_conversation_state(
    p_conversation_id UUID,
    p_new_state JSONB,
    p_new_stage_id UUID DEFAULT NULL::uuid,
    p_new_flow_id UUID DEFAULT NULL::uuid
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE public.conversations
    SET 
        context_state = COALESCE(context_state, '{}'::jsonb) || COALESCE(p_new_state, '{}'::jsonb),
        current_stage_id = COALESCE(p_new_stage_id, current_stage_id),
        current_flow_id = COALESCE(p_new_flow_id, current_flow_id),
        updated_at = NOW()
    WHERE id = p_conversation_id;
END;
$function$;

-- 2. Atualização de fn_update_context_state (estendendo a baseline de 20261001 sem quebrar assinatura nem parâmetros)
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
    v_requested_installments INTEGER;
    v_opt_in BOOLEAN;
    v_consent JSONB;
    v_identity_confirmed BOOLEAN;
    v_new_lead_metadata JSONB;
BEGIN
    -- 1. Atualiza sempre a conversa preservando chaves existentes em context_state e fazendo merge de metadata
    UPDATE public.conversations 
    SET 
        context_state = COALESCE(context_state, '{}'::jsonb) || jsonb_build_object(
            'current_step', CASE 
                WHEN p_current_step IS NOT NULL AND p_current_step <> 'stop_flow' THEN p_current_step 
                ELSE COALESCE(context_state->>'current_step', p_current_step)
            END,
            'updated_at', NOW(),
            'metadata', COALESCE(context_state->'metadata', '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb)
        ),
        updated_at = NOW()
    WHERE id = p_conversation_id
    RETURNING tenant_id, user_identifier INTO v_tenant_id, v_user_phone;

    -- Se a conversa não existir ou não tiver tenant, retorna com sucesso sem erro
    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('status', 'success', 'current_step', p_current_step, 'lead_updated', false);
    END IF;

    -- ⛔ Se for stop_flow (auto-reply / robô detectado), não sincroniza nada em agent_leads para não inflar métricas
    IF COALESCE(p_current_step, '') = 'stop_flow' THEN
        RETURN jsonb_build_object('status', 'success', 'current_step', p_current_step, 'lead_updated', false);
    END IF;

    -- 2. Extrai com segurança revenue, requested_amount, requested_installments, opt_in e consent se existirem no payload
    BEGIN
        IF p_metadata ? 'revenue' AND NULLIF(p_metadata->>'revenue', '') IS NOT NULL THEN
            v_revenue := (p_metadata->>'revenue')::numeric;
            IF v_revenue <= 0 THEN v_revenue := NULL; END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_revenue := NULL;
    END;

    BEGIN
        IF p_metadata ? 'requested_amount' AND NULLIF(p_metadata->>'requested_amount', '') IS NOT NULL THEN
            v_requested_amount := (p_metadata->>'requested_amount')::numeric;
            IF v_requested_amount <= 0 THEN v_requested_amount := NULL; END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_requested_amount := NULL;
    END;

    BEGIN
        IF p_metadata ? 'requested_installments' AND NULLIF(p_metadata->>'requested_installments', '') IS NOT NULL THEN
            v_requested_installments := (p_metadata->>'requested_installments')::integer;
            IF v_requested_installments <= 0 THEN v_requested_installments := NULL; END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_requested_installments := NULL;
    END;

    BEGIN
        IF (p_metadata->>'opt_in') IN ('true', 't', '1') THEN
            v_opt_in := true;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_opt_in := NULL;
    END;

    BEGIN
        IF p_metadata ? 'consent' AND jsonb_typeof(p_metadata->'consent') = 'object' THEN
            v_consent := p_metadata->'consent';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_consent := NULL;
    END;

    -- Extrai confirmação de identidade (explícita via payload ou inferida pelos passos seguintes)
    IF (p_metadata->>'identity_confirmed') IN ('true', 't', '1') 
       OR (p_metadata->>'cnpj_confirmed') IN ('true', 't', '1')
       OR p_current_step IN ('coleta_faturamento', 'coleta_valor', 'coleta_parcelas', 'consentimento_optin', 'criar_lead', 'apresenta_ofertas') THEN
        v_identity_confirmed := true;
    END IF;

    -- Se não há nenhum dado a sincronizar, encerra sem tocar em agent_leads
    IF v_revenue IS NULL AND v_requested_amount IS NULL AND v_requested_installments IS NULL AND v_opt_in IS NULL AND v_consent IS NULL AND v_identity_confirmed IS NULL THEN
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

            IF v_requested_installments IS NOT NULL THEN
                v_new_lead_metadata := v_new_lead_metadata || jsonb_build_object('requested_installments', v_requested_installments);
            END IF;

            IF v_opt_in = true THEN
                v_new_lead_metadata := v_new_lead_metadata || jsonb_build_object('opt_in', true);
            END IF;

            IF v_consent IS NOT NULL THEN
                v_new_lead_metadata := v_new_lead_metadata || jsonb_build_object('consent', v_consent);
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

COMMIT;
