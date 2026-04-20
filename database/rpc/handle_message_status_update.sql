-- RPC: handle_message_status_update
-- Description: Unified handler for message delivery status updates (DLR)
-- Updates both the message history and campaign metrics if applicable.
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
    RETURNING id INTO v_message_id;

    IF v_message_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Mensagem não encontrada com remote_id: ' || p_remote_id);
    END IF;

    -- [3] ATUALIZAR FILA DE CAMPANHAS (Se aplicável)
    -- Otimizado para usar o índice funcional no metadata->>'message_id'
    UPDATE public.outbound_queue
    SET status = v_mapped_status,
        error_message = CASE WHEN v_mapped_status = 'failed' THEN p_status_description ELSE error_message END,
        updated_at = NOW()
    WHERE (metadata->>'message_id') = v_message_id::text
      AND status NOT IN ('delivered', 'read', 'failed') -- Proteção contra updates atrasados que sobrescrevem estados finais
    RETURNING id INTO v_queue_id;

    -- [4] SINCRONIZAÇÃO DE ESTATÍSTICAS (Novo: Garante dashboard em tempo real para entregas)
    IF v_queue_id IS NOT NULL THEN
        PERFORM public.fn_sync_campaign_stats(
            (SELECT campaign_id FROM public.outbound_queue WHERE id = v_queue_id)
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message_id', v_message_id,
        'new_status', v_mapped_status,
        'linked_to_campaign', (v_queue_id IS NOT NULL),
        'queue_id', v_queue_id
    );
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.handle_message_status_update(text, text, text, timestamp with time zone, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_message_status_update(text, text, text, timestamp with time zone, jsonb) TO service_role;
