-- ==========================================================
-- [V60.0] CORREÇÃO CRÍTICA: ROBUSTEZ NO FATURAMENTO WHATSAPP
-- Data: 2026-04-24
-- ==========================================================

-- 1. FUNÇÃO DE PROCESSAMENTO ATUALIZADA (Suporta múltiplos nomes de chaves)
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

    -- 2. BUSCA JANELA ABERTA COM TRAVA (Impede race conditions)
    -- Ajuste: Verificamos o telefone mas também o tenant_id para isolamento total
    SELECT id INTO v_window_id
    FROM public.whatsapp_billing_windows
    WHERE tenant_id = p_tenant_id
      AND contact_phone = p_contact_phone
      AND status = 'open'
      AND window_expires_at > p_event_time
    FOR UPDATE SKIP LOCKED;

    -- 3. ABRE OU ATUALIZA A JANELA
    IF v_window_id IS NULL THEN
        INSERT INTO public.whatsapp_billing_windows (
            tenant_id, agent_id, conversation_id, first_message_id,
            contact_phone, provider, billing_mode, status,
            window_started_at, window_expires_at, last_activity_at,
            metadata
        ) VALUES (
            p_tenant_id, p_agent_id, p_conversation_id, p_message_id,
            p_contact_phone, 'zenvia', 'window_24h', 'open',
            p_event_time, p_event_time + interval '24 hours', p_event_time,
            jsonb_build_object('auto_backfilled', true) || p_metadata
        );
    ELSE
        UPDATE public.whatsapp_billing_windows 
        SET last_activity_at = p_event_time,
            last_message_id = p_message_id
        WHERE id = v_window_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. BACKFILL: Recupera conversas de hoje que não abriram janela
-- Vamos rodar isso para todas as mensagens de hoje (outbound) que ainda não tem janela correspondente.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 
            m.tenant_id, 
            conv.agent_id, 
            m.conversation_id, 
            m.id as message_id, 
            conv.user_identifier as phone, 
            m.created_at
        FROM messages m
        JOIN conversations conv ON m.conversation_id = conv.id
        WHERE m.direction = 'outbound'
          AND m.created_at >= date_trunc('day', NOW()) -- Apenas hoje
          AND conv.channel = 'whatsapp'
          -- Garante que não vamos duplicar se a janela já existir
          AND NOT EXISTS (
              SELECT 1 FROM whatsapp_billing_windows w
              WHERE w.tenant_id = m.tenant_id
                AND w.contact_phone = conv.user_identifier
                AND w.window_started_at <= m.created_at
                AND w.window_expires_at >= m.created_at
          )
    ) LOOP
        PERFORM public.fn_process_whatsapp_billing(
            r.tenant_id, r.agent_id, r.conversation_id, r.message_id, r.phone, r.created_at, '{"backfill_source": "recovery_v60"}'::jsonb
        );
    END LOOP;
END $$;
