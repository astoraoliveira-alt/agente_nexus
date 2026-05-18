-- ==========================================================
-- [V62.0] CORREÇÃO DE CORRIDA DE CORRIDA (RACE CONDITION) NO FATURAMENTO
-- Data: 2026-05-18
-- ==========================================================

CREATE OR REPLACE FUNCTION public.fn_process_whatsapp_billing(
    p_tenant_id UUID,
    p_agent_id UUID,
    p_conversation_id UUID,
    p_message_id UUID,
    p_contact_phone TEXT,
    p_event_time TIMESTAMP WITH TIME ZONE,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID AS $$
DECLARE
    v_billing_mode TEXT;
    v_window_id UUID;
BEGIN
    -- 1. Identifica o modo de faturamento (Robustez total nos nomes das chaves)
    SELECT 
        COALESCE(
            c.plan_prices->>'whatsappOfficialBillingMode', 
            c.plan_prices->>'whatsapp_official_billing_mode', 
            p.whatsapp_official_billing_mode, 
            'per_message'
        )
    INTO v_billing_mode
    FROM public.companies c
    LEFT JOIN public.plans p ON p.id = c.plan_tier
    WHERE c.id = p_tenant_id;

    -- Se não estiver em modo de janela (24h), ignora
    IF v_billing_mode <> 'window_24h' THEN RETURN; END IF;

    -- 2. BUSCA JANELA ABERTA COM TRAVA (Sem SKIP LOCKED para forçar sincronização)
    SELECT id INTO v_window_id
    FROM public.whatsapp_billing_windows
    WHERE tenant_id = p_tenant_id
      AND contact_phone = p_contact_phone
      AND status = 'open'
      AND window_expires_at > p_event_time
    FOR UPDATE;

    -- 3. ABRE OU ATUALIZA A JANELA COM TRATAMENTO DE CONFLITO
    IF v_window_id IS NULL THEN
        BEGIN
            INSERT INTO public.whatsapp_billing_windows (
                tenant_id, agent_id, conversation_id, first_message_id,
                contact_phone, provider, billing_mode, status,
                window_started_at, window_expires_at, last_activity_at,
                metadata
            ) VALUES (
                p_tenant_id, p_agent_id, p_conversation_id, p_message_id,
                p_contact_phone, 'zenvia', 'window_24h', 'open',
                p_event_time, p_event_time + interval '24 hours', p_event_time,
                jsonb_build_object('auto_created', true) || p_metadata
            );
        EXCEPTION WHEN unique_violation THEN
            -- Se outra transação concorrente inseriu a janela aberta entre o SELECT e o INSERT,
            -- recuperamos e atualizamos a janela existente de forma segura.
            UPDATE public.whatsapp_billing_windows 
            SET last_activity_at = p_event_time,
                last_message_id = p_message_id
            WHERE tenant_id = p_tenant_id
              AND contact_phone = p_contact_phone
              AND status = 'open';
        END;
    ELSE
        UPDATE public.whatsapp_billing_windows 
        SET last_activity_at = p_event_time,
            last_message_id = p_message_id
        WHERE id = v_window_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
