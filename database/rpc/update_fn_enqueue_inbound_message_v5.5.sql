-- DAVOS NEXUS - RPC: fn_enqueue_inbound_message (Versão Elite V5.5 - PREVENT DUPLICATES)
-- Descrição: Apaga versões antigas e cria a nova impedindo que Zenvia resete mensagens prontas para 'pending'.

DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- Busca e dropa todas as variações da função fn_enqueue_inbound_message
    FOR r IN (
        SELECT oid::regprocedure as formal_signature
        FROM pg_proc 
        WHERE proname = 'fn_enqueue_inbound_message' 
          AND pronamespace = 'public'::regnamespace
    ) 
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.formal_signature;
        RAISE NOTICE 'Versão antiga removida: %', r.formal_signature;
    END LOOP;
END $$;

-- Criação da versão definitiva
CREATE OR REPLACE FUNCTION public.fn_enqueue_inbound_message(
    p_tenant_id uuid,
    p_agent_id uuid,
    p_conversation_id uuid,
    p_external_id text,
    p_payload jsonb,
    p_trace_id text DEFAULT NULL,
    p_message_type text DEFAULT 'conversation',
    p_latency_ms integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_next_seq int;
BEGIN
    -- Calcula próximo número na sequência se houver conversa
    IF p_conversation_id IS NOT NULL THEN
        SELECT COALESCE(MAX(sequence_number), 0) + 1 
        INTO v_next_seq
        FROM public.inbound_queue
        WHERE conversation_id = p_conversation_id;
    ELSE
        v_next_seq := 1;
    END IF;

    INSERT INTO public.inbound_queue (
        tenant_id, 
        agent_id, 
        conversation_id, 
        external_id, 
        sequence_number, 
        payload, 
        status,
        trace_id,
        gateway_latency_ms,
        message_type
    )
    VALUES (
        p_tenant_id, 
        p_agent_id, 
        p_conversation_id, 
        p_external_id, 
        v_next_seq, 
        p_payload, 
        'pending',
        p_trace_id,
        COALESCE(p_latency_ms, 0),
        COALESCE(p_message_type, 'conversation')
    )
    ON CONFLICT (tenant_id, external_id) 
    DO UPDATE SET 
        status = CASE 
            WHEN inbound_queue.status IN ('done', 'processing', 'assigned', 'failed') THEN inbound_queue.status 
            ELSE 'pending' 
        END,
        trace_id = CASE 
            WHEN inbound_queue.status IN ('done', 'processing', 'assigned', 'failed') THEN inbound_queue.trace_id
            ELSE EXCLUDED.trace_id
        END,
        created_at = CASE 
            WHEN inbound_queue.status IN ('done', 'processing', 'assigned', 'failed') THEN inbound_queue.created_at
            ELSE NOW()
        END,
        message_type = EXCLUDED.message_type,
        payload = EXCLUDED.payload;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_enqueue_inbound_message TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_enqueue_inbound_message TO service_role;
