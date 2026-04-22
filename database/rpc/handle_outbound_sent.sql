-- Function to atomically handle successful outbound messages triggers by N8N
-- V5.3 - Trace ID Synchronization Fix
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
    p_trace_id text DEFAULT NULL -- Alterado de UUID para TEXT para aceitar prefixos ZNV
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_phone text;
    v_conversation_id uuid;
    v_message_id uuid;
    v_contact_id uuid;
BEGIN
    -- [0] VALIDAÇÃO INICIAL
    IF p_tenant_id IS NULL OR p_agent_id IS NULL OR p_contact_phone IS NULL THEN
        RAISE EXCEPTION 'tenant_id, agent_id e contact_phone são obrigatórios';
    END IF;

    -- [1] LIMPEZA NUCLEAR DO IDENTIFICADOR
    v_clean_phone := regexp_replace(p_contact_phone, '\D', '', 'g');
    
    IF v_clean_phone = '' THEN
        RAISE EXCEPTION 'Telefone inválido (sem dígitos) para o lead %', p_queue_id;
    END IF;

    -- [2] UPSERT DE CONTATO
    INSERT INTO public.contacts (identifier, name, tenant_id, metadata)
    VALUES (v_clean_phone, p_contact_name, p_tenant_id, jsonb_build_object('source', 'campaign', 'campaign_id', p_campaign_id))
    ON CONFLICT (identifier, tenant_id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
    RETURNING id INTO v_contact_id;

    -- [3] UPSERT DE CONVERSA
    INSERT INTO public.conversations (tenant_id, agent_id, user_identifier, user_name, channel, status, last_message_at)
    VALUES (p_tenant_id, p_agent_id, v_clean_phone, p_contact_name, COALESCE(p_channel, 'whatsapp'::public.conversation_channel), 'ai_active', NOW())
    ON CONFLICT (tenant_id, agent_id, user_identifier) DO UPDATE SET last_message_at = NOW(), status = 'ai_active', updated_at = NOW()
    RETURNING id INTO v_conversation_id;

    -- [4] REGISTRO DA MENSAGEM (Persistência histórica + TRACE ID!)
    INSERT INTO public.messages (
        tenant_id,
        conversation_id,
        content,
        direction,
        message_type,
        sender_type,
        remote_id,
        trace_id, -- 🔥 Elo Crítico para Limpeza da Fila
        metadata
    )
    VALUES (
        p_tenant_id,
        v_conversation_id,
        p_message_content,
        'outbound',
        p_message_type,
        'agent',
        p_remote_id,
        p_trace_id, -- 🔥 DNA da Conversa
        jsonb_build_object(
            'campaign_id', p_campaign_id, 
            'queue_id', p_queue_id
        )
    )
    RETURNING id INTO v_message_id;

    -- [5] STATUS DA FILA
    IF p_queue_id IS NOT NULL THEN
        UPDATE public.outbound_queue
        SET status = 'sent', sent_at = NOW(), conversation_id = v_conversation_id,
            metadata = metadata || jsonb_build_object('message_id', v_message_id)
        WHERE id = p_queue_id;
    END IF;

    -- [6] REGISTRO DE FILA DE ENTRADA (Sincronização Unificada)
    PERFORM public.fn_enqueue_inbound_message(
        p_tenant_id, p_agent_id, v_conversation_id, p_remote_id, 
        jsonb_build_object('type', 'outbound_status', 'status', 'sent', 'phone', v_clean_phone),
        p_trace_id, -- Trace original
        'outbound_sent'
    );

    IF p_campaign_id IS NOT NULL THEN
        PERFORM public.fn_sync_campaign_stats(p_campaign_id);
    END IF;

    RETURN jsonb_build_object('success', true, 'conversation_id', v_conversation_id, 'message_id', v_message_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_outbound_sent(uuid, uuid, text, text, text, uuid, uuid, text, text, public.conversation_channel, text) TO authenticated, service_role;
