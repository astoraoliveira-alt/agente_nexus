-- RPC: Retorna contagem real de mensagens por conversa (batch, sem paginação)
-- Substitui o workaround messages(count) que não funciona como agregado no PostgREST

CREATE OR REPLACE FUNCTION public.get_conversation_message_counts(p_tenant_id UUID)
RETURNS TABLE(conversation_id UUID, message_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        m.conversation_id,
        COUNT(*) AS message_count
    FROM messages m
    WHERE m.tenant_id = p_tenant_id
    GROUP BY m.conversation_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversation_message_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_conversation_message_counts(uuid) TO service_role;
