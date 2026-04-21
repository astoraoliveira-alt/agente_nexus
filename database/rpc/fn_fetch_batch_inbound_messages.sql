-- Função para o n8n buscar várias mensagens de uma vez só (Alta Performance)
CREATE OR REPLACE FUNCTION public.fn_fetch_batch_inbound_messages(
    p_tenant_id UUID,
    p_batch_size INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    tenant_id UUID,
    agent_id UUID,
    conversation_id UUID,
    trace_id TEXT,
    payload JSONB,
    sender_id TEXT,
    message_type TEXT
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH target_messages AS (
        SELECT m.id
        FROM public.inbound_queue m
        WHERE m.tenant_id = p_tenant_id
          AND m.status = 'pending'
        ORDER BY m.created_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED -- Garante que várias instâncias do n8n não peguem as mesmas mensagens
    )
    UPDATE public.inbound_queue q
    SET 
        status = 'processing',
        assigned_at = now()
    FROM target_messages
    WHERE q.id = target_messages.id
    RETURNING 
        q.id, q.tenant_id, q.agent_id, q.conversation_id, 
        q.trace_id, q.payload, q.sender_id, q.message_type;
END;
$$;
