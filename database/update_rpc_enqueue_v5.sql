-- ========================================================== --
-- AUTO-CLEANUP: DISCOVER AND DELETE ALL ENQUEUE OVERLOADS  --
-- ========================================================== --

DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- Busca TODAS as funções com este nome no schema public
    FOR r IN (
        SELECT oid::regprocedure as formal_signature
        FROM pg_proc 
        WHERE proname = 'fn_enqueue_inbound_message' 
          AND pronamespace = 'public'::regnamespace
    ) 
    LOOP
        -- Dropa cada uma dinamicamente
        EXECUTE 'DROP FUNCTION ' || r.formal_signature;
        RAISE NOTICE 'Dropped function: %', r.formal_signature;
    END LOOP;
END $$;

-- Agora criamos a versão final (V5.3) sem conflitos
CREATE OR REPLACE FUNCTION public.fn_enqueue_inbound_message(
    p_tenant_id uuid,
    p_agent_id uuid,
    p_conversation_id uuid,
    p_external_id text,
    p_payload jsonb,
    p_trace_id text DEFAULT NULL,
    p_message_type text DEFAULT 'text',
    p_latency_ms integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_next_seq int;
BEGIN
    SELECT COALESCE(MAX(sequence_number), 0) + 1 
    INTO v_next_seq
    FROM public.inbound_queue
    WHERE conversation_id = p_conversation_id;

    INSERT INTO public.inbound_queue (
        tenant_id, 
        agent_id, 
        conversation_id, 
        external_id, 
        sequence_number, 
        payload, 
        status,
        trace_id,
        gateway_latency_ms
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
        p_latency_ms
    )
    ON CONFLICT (tenant_id, external_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.fn_enqueue_inbound_message IS 'Versão Final Auto-Resolvida: Limpeza dinâmica de overloads via DO block.';

ALTER TABLE public.inbound_queue 
ADD COLUMN IF NOT EXISTS trace_id TEXT,
ADD COLUMN IF NOT EXISTS gateway_latency_ms INTEGER DEFAULT 0;
