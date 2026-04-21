-- 1. Drop existing functions to allow changing signature
DROP FUNCTION IF EXISTS public.record_message(uuid, uuid, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.record_message(uuid, uuid, text, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.record_message(uuid, uuid, text, text, text, text, text, text, jsonb, text);

-- 2. Re-create following your current logic + remote_id support
CREATE OR REPLACE FUNCTION public.record_message(
    p_conversation_id UUID,
    p_tenant_id UUID,
    p_content TEXT DEFAULT NULL,
    p_sender_type TEXT DEFAULT 'user',
    p_sender_name TEXT DEFAULT NULL,
    p_message_type TEXT DEFAULT 'text',
    p_trace_id TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_remote_id TEXT DEFAULT NULL  -- O campo que faltava
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Lógica de Reset
    IF p_content IS NOT NULL AND trim(p_content) = '#reset' THEN
        PERFORM public.fn_reset_conversation(p_conversation_id);
    END IF;

    -- Inserção na Tabela Messages
    INSERT INTO public.messages (
        conversation_id, 
        tenant_id, 
        content, 
        sender_type, 
        sender_name, 
        message_type, 
        trace_id, 
        metadata,
        remote_id
    ) VALUES (
        p_conversation_id, 
        p_tenant_id, 
        public.clean_message_content(p_content), 
        p_sender_type, 
        p_sender_name, 
        p_message_type, 
        p_trace_id, 
        p_metadata,
        p_remote_id
    );

    -- 🛡️ LOOP BREAKER: Finaliza o item na fila de entrada se houver trace_id
    IF p_trace_id IS NOT NULL THEN
        UPDATE public.inbound_queue
        SET status = 'done',
            error_message = COALESCE(error_message, '') || ' [Auto-Cleanup: Response Recorded]'
        WHERE trace_id = p_trace_id;
    END IF;

    RETURN jsonb_build_object('status', 'success');
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.record_message(uuid, uuid, text, text, text, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_message(uuid, uuid, text, text, text, text, text, jsonb, text) TO service_role;
