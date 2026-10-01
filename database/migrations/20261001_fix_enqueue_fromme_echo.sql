-- ============================================================
-- DAVOS NEXUS - FIX: Filtro fromMe no fn_enqueue_inbound_message
-- Versão: V5.6 - PREVENT ECHO (Evolution API fromMe=true)
-- 
-- PROBLEMA: Evolution API envia webhook para toda mensagem, incluindo
-- mensagens enviadas PELO próprio agente (fromMe=true). Sem esse filtro,
-- a mensagem do operador era reenfileirada e enviada ao cliente novamente,
-- causando duplicatas no WhatsApp.
--
-- SOLUÇÃO: Rejeitar silenciosamente qualquer payload com:
--   payload->>'fromMe' = 'true'   (Evolution API)
--   payload->>'from_me' = 'true'  (variação de formato)
-- ============================================================

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
    -- 🛡️ FILTRO ECHO: Rejeita mensagens fromMe=true (Evolution API eco)
    IF (p_payload->>'fromMe')::boolean IS TRUE 
       OR (p_payload->>'from_me')::boolean IS TRUE THEN
        RAISE NOTICE 'fn_enqueue_inbound_message: descartado echo fromMe para external_id=%', p_external_id;
        RETURN;
    END IF;

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
        tenant_id, agent_id, conversation_id, external_id,
        sequence_number, payload, status, trace_id,
        gateway_latency_ms, message_type
    )
    VALUES (
        p_tenant_id, p_agent_id, p_conversation_id, p_external_id,
        v_next_seq, p_payload, 'pending', p_trace_id,
        COALESCE(p_latency_ms, 0), COALESCE(p_message_type, 'conversation')
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
