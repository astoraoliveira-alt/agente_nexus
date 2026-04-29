-- =============================================== --
-- DAVOS NEXUS - TICKET 2.1: TRACING CONTRACT      --
-- =============================================== --

-- 1. Tabela Inbound Queue (Fila de Entrada)
ALTER TABLE public.inbound_queue 
ADD COLUMN IF NOT EXISTS trace_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_inbound_queue_trace_id 
ON public.inbound_queue(trace_id) WHERE trace_id IS NOT NULL;

-- 2. Tabela Messages (Histórico Definitivo)
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS trace_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_messages_trace_id 
ON public.messages(trace_id) WHERE trace_id IS NOT NULL;

-- 3. Tabela Outbound Queue (Fila de Disparo / Saída)
ALTER TABLE public.outbound_queue 
ADD COLUMN IF NOT EXISTS trace_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_outbound_queue_trace_id 
ON public.outbound_queue(trace_id) WHERE trace_id IS NOT NULL;

-- 4. Função Utilitária de Debug (Garante visibilidade End-to-End)
-- Esta RPC é fantástica para você debugar qualquer mensagem no futuro
CREATE OR REPLACE FUNCTION public.fn_get_trace_lifecycle(
    p_trace_id VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inbound JSONB;
    v_dlq JSONB;
    v_message JSONB;
    v_outbound JSONB;
    v_consumption JSONB;
BEGIN
    -- Busca Inbound Status
    SELECT jsonb_build_object(
        'status', status, 
        'error_message', error_message, 
        'processed_at', processed_at
    ) INTO v_inbound
    FROM public.inbound_queue WHERE trace_id = p_trace_id LIMIT 1;
    
    -- Busca DLQ (Erros Fatais Inbound)
    SELECT jsonb_build_object(
        'status', status, 
        'error_message', error_message,
        'created_at', created_at
    ) INTO v_dlq
    FROM public.inbound_queue_errors WHERE trace_id = p_trace_id LIMIT 1;

    -- Busca Messages
    SELECT jsonb_build_object(
        'id', id, 
        'sender_type', sender_type, 
        'created_at', created_at
    ) INTO v_message
    FROM public.messages WHERE trace_id = p_trace_id LIMIT 1;

    -- Busca Outbound
    SELECT jsonb_build_object(
        'status', status, 
        'error_message', error_message, 
        'sent_at', sent_at
    ) INTO v_outbound
    FROM public.outbound_queue WHERE trace_id = p_trace_id LIMIT 1;

    -- Busca Consumption
    SELECT jsonb_build_object(
        'cost_usd', COALESCE((metadata->>'cost_usd')::numeric, 0), 
        'model', metadata->>'model', 
        'recorded_at', recorded_at
    ) INTO v_consumption
    FROM public.consumption_metrics WHERE trace_id = p_trace_id LIMIT 1;
    
    RETURN jsonb_build_object(
        'trace_id', p_trace_id,
        'lifecycle', jsonb_build_object(
            '1_inbound', v_inbound,
            '1b_inbound_dlq', v_dlq,
            '2_llm_cost_recorded', CASE WHEN v_consumption IS NOT NULL THEN true ELSE false END,
            '3_message_saved', CASE WHEN v_message IS NOT NULL THEN true ELSE false END,
            '4_outbound', v_outbound
        )
    );
END;
$$;
