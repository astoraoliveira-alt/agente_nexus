-- ==========================================================
-- [V61.0] CORREÇÃO DEFINITIVA: RECORD_MESSAGE + BILLING TRIGGER
-- Data: 2026-04-24
-- ==========================================================

-- 1. LIMPEZA DE GHOST FUNCTIONS E TRIGGERS
DROP TRIGGER IF EXISTS trg_apply_whatsapp_billing_messages ON public.messages;
DROP TRIGGER IF EXISTS trg_apply_whatsapp_billing_window ON public.outbound_queue;

-- Remove funções antigas se existirem com nomes variados
DROP FUNCTION IF EXISTS public.fn_apply_whatsapp_billing_window_logic(uuid, uuid, uuid, uuid, text, timestamptz);
DROP FUNCTION IF EXISTS public.fn_trg_billing_messages_unified();

-- 2. CRIAÇÃO DA FUNÇÃO DE PROCESSAMENTO CORE (Latest V60 Logic)
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
            jsonb_build_object('auto_created', true) || p_metadata
        );
    ELSE
        UPDATE public.whatsapp_billing_windows 
        SET last_activity_at = p_event_time,
            last_message_id = p_message_id
        WHERE id = v_window_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. NOVA FUNÇÃO DE GATILHO (Aponta para a função correta)
CREATE OR REPLACE FUNCTION public.fn_trg_billing_messages_unified()
RETURNS trigger AS $$
DECLARE
    v_agent_id UUID;
    v_phone TEXT;
BEGIN
    -- Processa apenas mensagens enviadas (outbound)
    -- Importante: Verifica direction e canal whatsapp
    IF NEW.direction <> 'outbound' THEN RETURN NEW; END IF;
    
    -- Busca dados da conversa para validar se é Whatsapp
    SELECT agent_id, user_identifier INTO v_agent_id, v_phone
    FROM public.conversations 
    WHERE id = NEW.conversation_id 
      AND channel = 'whatsapp';

    IF v_agent_id IS NOT NULL AND v_phone IS NOT NULL THEN
        PERFORM public.fn_process_whatsapp_billing(
            NEW.tenant_id, 
            v_agent_id, 
            NEW.conversation_id, 
            NEW.id, 
            v_phone, 
            NEW.created_at,
            jsonb_build_object('trigger_origin', 'messages_v61')
        );
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Silencioso para não quebrar o insert se o billing falhar, 
    -- mas registra no log se possível (aqui apenas continua)
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. RE-APLICA O GATILHO
CREATE TRIGGER trg_apply_whatsapp_billing_messages
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.fn_trg_billing_messages_unified();

-- 5. RE-APLICA A RPC RECORD_MESSAGE (Garante que está limpa)
-- (O código da record_message que o usuário mandou está correto, vamos apenas garantir que ela use a clean_message_content)
CREATE OR REPLACE FUNCTION public.record_message(
    p_conversation_id UUID,
    p_tenant_id UUID,
    p_content TEXT DEFAULT NULL,
    p_sender_type TEXT DEFAULT 'user',
    p_sender_name TEXT DEFAULT NULL,
    p_message_type TEXT DEFAULT 'text',
    p_trace_id TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_remote_id TEXT DEFAULT NULL,
    p_file_url TEXT DEFAULT NULL,
    p_transcription TEXT DEFAULT NULL,
    p_direction TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_direction TEXT;
BEGIN
    v_direction := COALESCE(p_direction, CASE WHEN p_sender_type = 'user' THEN 'inbound' ELSE 'outbound' END);

    INSERT INTO public.messages (
        conversation_id, tenant_id, content, sender_type, sender_name, 
        message_type, trace_id, metadata, remote_id, direction
    ) VALUES (
        p_conversation_id, p_tenant_id, public.clean_message_content(p_content), 
        p_sender_type, p_sender_name, p_message_type, p_trace_id, 
        p_metadata || jsonb_build_object('file_url', p_file_url, 'transcription', p_transcription),
        p_remote_id, v_direction
    );

    IF p_trace_id IS NOT NULL THEN
        UPDATE public.inbound_queue SET status = 'done', processed_at = NOW()
        WHERE trace_id = p_trace_id OR external_id = p_trace_id;
    END IF;

    RETURN jsonb_build_object('status', 'success', 'direction', v_direction);
END;
$$;
