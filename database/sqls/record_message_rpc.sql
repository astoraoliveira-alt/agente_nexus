-- 1. Drop existing functions to allow changing signature
DROP FUNCTION IF EXISTS public.record_message(uuid, uuid, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.record_message(uuid, uuid, text, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.record_message(uuid, uuid, text, text, text, text, text, text, jsonb, text);
DROP FUNCTION IF EXISTS public.record_message(uuid, uuid, text, text, text, text, text, text, jsonb, text, text); -- 🔥 Versão de 11 params

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
    p_remote_id TEXT DEFAULT NULL,
    p_file_url TEXT DEFAULT NULL,
    p_transcription TEXT DEFAULT NULL,
    p_direction TEXT DEFAULT NULL,
    p_external_id TEXT DEFAULT NULL  -- 🔥 Novo: Idempotência Real
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_direction TEXT;
BEGIN
    -- [1] Lógica de Auto-Detecção de Direção
    IF p_direction IS NOT NULL THEN
        v_direction := p_direction;
    ELSIF p_sender_type = 'user' THEN
        v_direction := 'inbound';
    ELSE
        v_direction := 'outbound';
    END IF;

    -- [2] Lógica de Reset
    IF p_content IS NOT NULL AND trim(p_content) = '#reset' THEN
        PERFORM public.fn_reset_conversation(p_conversation_id);
    END IF;

    -- [3] Inserção na Tabela Messages com Idempotência
    INSERT INTO public.messages (
        conversation_id, 
        tenant_id, 
        content, 
        sender_type, 
        sender_name, 
        message_type, 
        trace_id, 
        metadata,
        remote_id,
        external_id,   -- 🔥 Mapeamento correto
        direction
    ) VALUES (
        p_conversation_id, 
        p_tenant_id, 
        public.clean_message_content(p_content), 
        p_sender_type, 
        p_sender_name, 
        p_message_type, 
        p_trace_id, 
        p_metadata || jsonb_build_object(
            'file_url', p_file_url,
            'transcription', p_transcription
        ),
        p_remote_id,
        COALESCE(p_external_id, p_remote_id), -- Fallback se external_id for null
        v_direction
    )
    ON CONFLICT (tenant_id, external_id) DO NOTHING; -- 🛡️ BLOQUEIO DE DUPLICATAS

    -- [4] 🛡️ LOOP BREAKER: Finaliza o item na fila de entrada
    IF p_trace_id IS NOT NULL THEN
        UPDATE public.inbound_queue
        SET status = 'done',
            processed_at = NOW(),
            error_message = COALESCE(error_message, '') || ' [Auto-Cleanup: Response Recorded]'
        WHERE trace_id = p_trace_id OR external_id = p_trace_id OR external_id = p_external_id;
    END IF;

    RETURN jsonb_build_object('status', 'success', 'direction_recorded', v_direction);
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.record_message(uuid, uuid, text, text, text, text, text, jsonb, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_message(uuid, uuid, text, text, text, text, text, jsonb, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_message(uuid, uuid, text, text, text, text, text, jsonb, text, text, text, text) TO anon;
