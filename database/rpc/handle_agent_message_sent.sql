-- RPC: handle_agent_message_sent
-- Description: Updates a message sent by an Agent (Manual or AI) with its provider ID and adds tracking to inbound_queue.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_agent_message_sent(
    p_message_id uuid,
    p_remote_id text,
    p_tenant_id uuid,
    p_agent_id uuid,
    p_conversation_id uuid,
    p_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rows_affected int;
BEGIN
    -- 1. Atualiza a mensagem original com o ID do provedor
    UPDATE public.messages
    SET remote_id = p_remote_id,
        status = 'sent',
        updated_at = NOW()
    WHERE id = p_message_id;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    IF v_rows_affected = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Mensagem não encontrada: ' || p_message_id);
    END IF;

    -- 2. Registra na inbound_queue para controle centralizado de status (DLR)
    PERFORM public.fn_enqueue_inbound_message(
        p_tenant_id,
        p_agent_id,
        p_conversation_id,
        p_remote_id, -- ID da Zenvia
        jsonb_build_object(
            'type', 'outbound_status',
            'status', 'sent',
            'message_id', p_message_id,
            'phone', p_phone
        ),
        NULL, -- trace_id (opcional)
        'outbound_sent'
    );

    RETURN jsonb_build_object(
        'success', true,
        'message_id', p_message_id,
        'remote_id', p_remote_id
    );
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.handle_agent_message_sent(uuid, text, uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_agent_message_sent(uuid, text, uuid, uuid, uuid, text) TO service_role;
