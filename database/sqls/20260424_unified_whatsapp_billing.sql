-- ==========================================================
-- [V59.0] ESTABILIZAÇÃO DO FATURAMENTO WHATSAPP (UNIFICADO)
-- Data: 2026-04-24
-- ==========================================================

-- 1. REMOVE O GATILHO ANTIGO (Prevenção de Duplicidade)
DROP TRIGGER IF EXISTS trg_apply_whatsapp_billing_window ON public.outbound_queue;

-- 2. FUNÇÃO CORE COM TRAVA DE SEGURANÇA (FOR UPDATE)
-- Esta função é responsável por abrir ou atualizar as janelas de 24h (R$ 1,10)
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
    -- 1. Identifica o modo de faturamento (Consulta Empresa -> Plano)
    SELECT 
        COALESCE(c.plan_prices->>'whatsappOfficialBillingMode', p.whatsapp_official_billing_mode, 'per_message')
    INTO v_billing_mode
    FROM public.companies c
    LEFT JOIN public.plans p ON p.id = c.plan_tier
    WHERE c.id = p_tenant_id;

    -- Se não estiver em modo de janela (24h), ignora
    IF v_billing_mode <> 'window_24h' THEN RETURN; END IF;

    -- 2. BUSCA JANELA ABERTA COM TRAVA (Impede race conditions)
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
            p_metadata
        );
    ELSE
        UPDATE public.whatsapp_billing_windows 
        SET last_activity_at = p_event_time,
            last_message_id = p_message_id
        WHERE id = v_window_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. GATILHO ÚNICO NA TABELA DE MENSAGENS (Conversas Sofia + Campanhas)
CREATE OR REPLACE FUNCTION public.fn_trg_billing_messages_unified()
RETURNS trigger AS $$
DECLARE
    v_agent_id UUID;
    v_phone TEXT;
BEGIN
    -- Processa apenas mensagens enviadas (outbound)
    IF NEW.direction <> 'outbound' THEN RETURN NEW; END IF;
    
    -- Busca metadados da conversa
    SELECT agent_id, user_identifier INTO v_agent_id, v_phone
    FROM public.conversations WHERE id = NEW.conversation_id;

    -- Se houver agente e telefone, solicita o processamento de faturamento
    IF v_agent_id IS NOT NULL AND v_phone IS NOT NULL THEN
        PERFORM public.fn_process_whatsapp_billing(
            NEW.tenant_id, v_agent_id, NEW.conversation_id, NEW.id, v_phone, NEW.created_at
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplica o gatilho na tabela original de mensagens
DROP TRIGGER IF EXISTS trg_apply_whatsapp_billing_messages ON public.messages;
CREATE TRIGGER trg_apply_whatsapp_billing_messages
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.fn_trg_billing_messages_unified();
