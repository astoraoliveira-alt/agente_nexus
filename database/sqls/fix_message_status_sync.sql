-- ==========================================================
-- RPC: handle_message_status_update (V5.5 - Cross-Table Sync)
-- Descrição: Processa status do provedor, normaliza e sincroniza outbound_queue
-- ==========================================================

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
    v_clean_status text;
    v_campaign_id uuid;
BEGIN
    -- 1. Normalização do Status (Suporta Evolution API e Zenvia)
    v_clean_status := LOWER(p_status_code);
    IF v_clean_status = 'delivery_ack' OR v_clean_status = 'delivered' THEN
        v_clean_status := 'delivered';
    ELSIF v_clean_status = 'read' OR v_clean_status = 'played' THEN
        v_clean_status := 'read';
    ELSIF v_clean_status = 'rejected' OR v_clean_status = 'failed' OR v_clean_status = 'error' THEN
        v_clean_status := 'failed';
    END IF;

    -- 2. Tenta encontrar a mensagem original
    SELECT id, trace_id, (metadata->>'campaign_id')::uuid 
    INTO v_message_id, v_trace_id, v_campaign_id
    FROM public.messages
    WHERE remote_id = p_remote_id OR trace_id = p_trace_id OR trace_id = p_remote_id
    ORDER BY created_at DESC LIMIT 1;

    -- 3. Registro do Status na Mensagem
    IF v_message_id IS NOT NULL THEN
        UPDATE public.messages
        SET status = v_clean_status,
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'raw_provider_status', p_status_code,
                'status_description', p_status_description,
                'updated_at', NOW()
            )
        WHERE id = v_message_id;

        -- 4. SINCRONIZAÇÃO COM OUTBOUND_QUEUE (Crítico para Dashboard)
        UPDATE public.outbound_queue
        SET status = v_clean_status
        WHERE (metadata->>'message_id')::uuid = v_message_id;

        -- 5. Sincroniza estatísticas da campanha se houver
        IF v_campaign_id IS NOT NULL THEN
            PERFORM public.fn_sync_campaign_stats(v_campaign_id);
        END IF;

        INSERT INTO public.message_status_history (message_id, status, description, raw_payload)
        VALUES (v_message_id, p_status_code, p_status_description, jsonb_build_object('trace_id', p_trace_id, 'remote_id', p_remote_id));
    END IF;

    -- 6. SMART CLEANUP (Sofia Failsafe)
    IF v_clean_status = 'failed' THEN
        UPDATE public.inbound_queue
        SET status = 'done', 
            processed_at = NOW(),
            context = COALESCE(context, '{}'::jsonb) || jsonb_build_object('cleanup_reason', 'provider_rejection', 'error', p_status_description)
        WHERE external_id = p_remote_id 
           OR trace_id = p_remote_id
           OR (v_trace_id IS NOT NULL AND trace_id = v_trace_id);
    END IF;

    RETURN jsonb_build_object('success', true, 'status_mapped', v_clean_status);
END;
$$;
