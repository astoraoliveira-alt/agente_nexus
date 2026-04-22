-- RPC: handle_message_status_update (V5.2 - Smart Cleanup)
-- Description: Unified handler for status updates and queue cleanup.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_message_status_update(
    p_remote_id text,
    p_status_code text,
    p_status_description text DEFAULT NULL,
    p_timestamp timestamp with time zone DEFAULT NOW(),
    p_error_details jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_message_id uuid;
    v_trace_id text;
    v_mapped_status text;
    v_queue_id uuid;
BEGIN
    -- [1] MAPEAMENTO DE STATUS
    v_mapped_status := CASE 
        WHEN p_status_code IN ('DELIVERED', 'RECEIVED', 'READ') THEN 'delivered'
        WHEN p_status_code IN ('REJECTED', 'FAILED', 'UNDELIVERED') THEN 'failed'
        WHEN p_status_code = 'SENT' THEN 'sent'
        ELSE NULL
    END;

    IF v_mapped_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Status desconhecido: ' || p_status_code);
    END IF;

    -- [2] ATUALIZAR TABELA DE MENSAGENS (Histórico/Chat)
    UPDATE public.messages
    SET status = v_mapped_status,
        metadata = metadata || jsonb_build_object(
            'dlr_status', p_status_code,
            'dlr_at', p_timestamp,
            'dlr_error', p_status_description
        )
    WHERE remote_id = p_remote_id
    RETURNING id, trace_id INTO v_message_id, v_trace_id;

    -- [3] ATUALIZAR FILA DE CAMPANHAS (Se aplicável)
    IF v_message_id IS NOT NULL THEN
        UPDATE public.outbound_queue
        SET status = v_mapped_status,
            error_message = CASE WHEN v_mapped_status = 'failed' THEN p_status_description ELSE error_message END
        WHERE (metadata->>'message_id') = v_message_id::text
          AND status NOT IN ('delivered', 'read', 'failed')
        RETURNING id INTO v_queue_id;

        -- Sincronização de estatísticas
        IF v_queue_id IS NOT NULL THEN
            PERFORM public.fn_sync_campaign_stats(
                (SELECT campaign_id FROM public.outbound_queue WHERE id = v_queue_id)
            );
        END IF;
    END IF;

    -- [4] 🛡️ LOOP BREAKER: LIMPAR FILA DE ENTRADA (Ação Crítica)
    -- Se o status vier como 'failed', forçamos a limpeza da inbound_queue usando o trace_id original.
    UPDATE public.inbound_queue
    SET status = 'done',
        processed_at = now(),
        error_message = COALESCE(error_message, '') || ' [Smart-Cleanup via Status: ' || v_mapped_status || ']'
    WHERE external_id = p_remote_id 
       OR trace_id = p_remote_id
       OR (v_trace_id IS NOT NULL AND trace_id = v_trace_id);

    RETURN jsonb_build_object(
        'success', true,
        'message_id', v_message_id,
        'new_status', v_mapped_status,
        'queue_id', v_queue_id,
        'trace_id', v_trace_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_message_status_update TO authenticated, service_role;
