-- RPC: handle_message_status_update (V5.4 - Fix de Nomes de Coluna)
-- Description: Processa o status da Zenvia e limpa a fila de entrada se houver erro fatal.
CREATE OR REPLACE FUNCTION public.handle_message_status_update(
    p_remote_id text,
    p_status_code text,
    p_status_description text,
    p_trace_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_message_id uuid;
    v_trace_id text;
BEGIN
    -- 1. Tenta encontrar a mensagem original pelo remote_id (ID da Zenvia)
    SELECT id, trace_id INTO v_message_id, v_trace_id
    FROM public.messages
    WHERE remote_id = p_remote_id;

    -- 2. SMART CLEANUP: Se a mensagem deu erro fatal, limpa a fila de entrada!
    IF p_status_code = 'REJECTED' OR p_status_code = 'FAILED' THEN
        UPDATE public.inbound_queue
        SET status = 'done', 
            processed_at = NOW(),
            context = COALESCE(context, '{}'::jsonb) || jsonb_build_object('cleanup_reason', 'provider_rejection', 'status_code', p_status_code) -- 🔥 CORREÇÃO: ERA metadata
        WHERE external_id = p_remote_id 
           OR trace_id = p_remote_id
           OR (v_trace_id IS NOT NULL AND trace_id = v_trace_id);
    END IF;

    -- 3. Histórico de Status (Este continua normal pois a tabela messages tem metadata)
    IF v_message_id IS NOT NULL THEN
        UPDATE public.messages
        SET status = p_status_code,
            metadata = metadata || jsonb_build_object('last_status_description', p_status_description)
        WHERE id = v_message_id;

        INSERT INTO public.message_status_history (message_id, status, description, raw_payload)
        VALUES (v_message_id, p_status_code, p_status_description, jsonb_build_object('trace_id', p_trace_id));
    END IF;

    RETURN jsonb_build_object('success', true, 'trace_id_cleaned', v_trace_id);
END;
$$;

-- RPC: handle_outbound_sent (V5.4 - Fix de Nomes de Coluna Sofia)
CREATE OR REPLACE FUNCTION public.handle_outbound_sent(
    p_tenant_id uuid,
    p_agent_id uuid,
    p_contact_phone text,
    p_contact_name text,
    p_message_content text,
    p_queue_id uuid,
    p_campaign_id uuid,
    p_message_type text DEFAULT 'text',
    p_remote_id text DEFAULT NULL,
    p_channel public.conversation_channel DEFAULT 'whatsapp'::public.conversation_channel,
    p_trace_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_conversation_id uuid;
    v_message_id uuid;
BEGIN
    -- [1] Upsert Conversa
    INSERT INTO public.conversations (tenant_id, agent_id, user_identifier, user_name, channel, status, last_message_at)
    VALUES (p_tenant_id, p_agent_id, regexp_replace(p_contact_phone, '\D', '', 'g'), p_contact_name, COALESCE(p_channel, 'whatsapp'), 'ai_active', NOW())
    ON CONFLICT (tenant_id, agent_id, user_identifier) DO UPDATE SET status = 'ai_active', last_message_at = NOW()
    RETURNING id INTO v_conversation_id;

    -- [2] Registro da Mensagem
    INSERT INTO public.messages (
        tenant_id, conversation_id, content, direction, message_type, sender_type, remote_id, trace_id
    )
    VALUES (
        p_tenant_id, v_conversation_id, p_message_content, 'outbound', p_message_type, 'agent', p_remote_id, p_trace_id
    )
    RETURNING id INTO v_message_id;

    -- [3] Limpeza da fila de saída (outbound_queue usa metadata)
    UPDATE public.outbound_queue 
    SET status = 'sent', 
        sent_at = NOW(),
        metadata = metadata || jsonb_build_object('message_id', v_message_id) 
    WHERE id = p_queue_id;

    PERFORM public.fn_sync_campaign_stats(p_campaign_id);

    RETURN jsonb_build_object('success', true, 'message_id', v_message_id);
END;
$$;
