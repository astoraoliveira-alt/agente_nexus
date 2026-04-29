-- [V2.1] DLQ RECOVERY & CLEANUP FUNCTION (Com suporte a p_payload)
CREATE OR REPLACE FUNCTION public.fn_log_dlq_error(
    p_execution_id TEXT,
    p_error_message JSONB,
    p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_queue_id UUID;
    v_error_text TEXT;
BEGIN
    -- 1. IDENTIFICA O ID DA FILA (Pelo execution_id ou pelo payload do erro)
    v_queue_id := (
        SELECT id FROM public.inbound_queue 
        WHERE n8n_execution_id = p_execution_id 
        LIMIT 1
    );

    IF v_queue_id IS NULL THEN
        -- Tenta extrair do payload se for erro no nó Fetch
        v_queue_id := (p_payload->'execution'->'data'->'RPC - Acesso Entrada'->0->>'id')::UUID;
    END IF;

    -- 2. MARCA COMO FALHA (DESBLOQUEIA A FILA)
    IF v_queue_id IS NOT NULL THEN
        UPDATE public.inbound_queue
        SET 
            status = 'failed',
            error_message = COALESCE(p_error_message->>'message', 'N8N Error flow triggered'),
            processed_at = NOW()
        WHERE id = v_queue_id;
    END IF;

    -- 3. REGISTRA O LOG NA TABELA DE ERROS
    INSERT INTO public.inbound_queue_errors (
        n8n_execution_id,
        queue_id,
        error_message,
        payload,
        status
    ) VALUES (
        p_execution_id,
        v_queue_id,
        COALESCE(p_error_message->>'message', 'Unknown Error'),
        COALESCE(p_payload, p_error_message), -- Usa o payload total se existir
        'critical_dlq'
    );

    RETURN jsonb_build_object(
        'success', true, 
        'queue_id_unlocked', v_queue_id,
        'execution_id', p_execution_id
    );
END;
$$;
