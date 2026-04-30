-- RPC to fetch contacts with objections, resistance, or requests for human attendants
CREATE OR REPLACE FUNCTION public.get_objection_contacts(p_tenant_id UUID)
RETURNS TABLE (
    id UUID,
    tenant_id UUID,
    name VARCHAR,
    identifier VARCHAR,
    email VARCHAR,
    phone VARCHAR,
    avatar_url VARCHAR,
    tags JSONB,
    channel VARCHAR,
    extra_info JSONB,
    lifecycle_status VARCHAR,
    status VARCHAR,
    sentiment VARCHAR,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    objection_reason VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH FlaggedConversations AS (
        SELECT 
            c.id AS conversation_id,
            c.user_identifier,
            'Sentiment/Tag'::VARCHAR AS reason
        FROM conversations c
        WHERE c.tenant_id = p_tenant_id
          AND (c.sentiment IN ('resistente', 'negativo', 'preocupado', 'objection')
               OR EXISTS (
                   SELECT 1 FROM messages m 
                   WHERE m.conversation_id = c.id 
                     AND m.sender_type = 'user'
                     AND m.content ILIKE ANY (ARRAY[
                         '%atendente%', '%humano%', '%falar com algu_m%', '%passar para um humano%', 
                         '%pessoas reais%', '%agressivo%', '%ruim%', '%p_ssimo%', '%cancela%', 
                         '%parar%', '%n_o quero%', '%mentira%', '%procon%', '%lixo%', '%reclama_ão%'
                     ])
               )
          )
    )
    SELECT DISTINCT
        ct.id,
        ct.tenant_id,
        ct.name,
        ct.identifier,
        ct.email,
        ct.phone,
        ct.avatar_url,
        ct.tags,
        ct.channel,
        ct.extra_info,
        ct.lifecycle_status,
        ct.status,
        ct.sentiment,
        ct.created_at,
        ct.updated_at,
        COALESCE(fc.reason, 'Message Pattern')::VARCHAR AS objection_reason
    FROM contacts ct
    LEFT JOIN FlaggedConversations fc ON ct.identifier = fc.user_identifier
    WHERE ct.tenant_id = p_tenant_id
      AND (
          ct.sentiment IN ('resistente', 'negativo', 'preocupado', 'objection')
          OR fc.conversation_id IS NOT NULL
      )
    ORDER BY ct.updated_at DESC;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.get_objection_contacts(UUID) TO authenticated;
