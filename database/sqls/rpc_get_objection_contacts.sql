-- RPC to fetch contacts with objections, resistance, or requests for human attendants
DROP FUNCTION IF EXISTS public.get_objection_contacts(UUID);

CREATE OR REPLACE FUNCTION public.get_objection_contacts(p_tenant_id UUID)
RETURNS TABLE (
    id UUID,
    tenant_id UUID,
    name VARCHAR,
    identifier VARCHAR,
    email VARCHAR,
    phone VARCHAR,
    avatar_url TEXT,
    tags TEXT[],
    channel VARCHAR,
    extra_info JSONB,
    lifecycle_status VARCHAR,
    status VARCHAR,
    sentiment VARCHAR,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    objection_reason TEXT,
    conversation_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH FlaggedConversations AS (
        SELECT 
            c.id AS conv_id,
            c.user_identifier,
            c.updated_at,
            'Sentiment/Tag'::TEXT AS reason
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
    SELECT 
        ct.id,
        ct.tenant_id,
        ct.name::VARCHAR,
        ct.identifier::VARCHAR,
        ct.email::VARCHAR,
        ct.phone::VARCHAR,
        ct.avatar_url::TEXT,
        ct.tags,
        ct.channel::VARCHAR,
        ct.extra_info,
        ct.lifecycle_status::VARCHAR,
        ct.status::VARCHAR,
        ct.sentiment::VARCHAR,
        ct.created_at,
        ct.updated_at,
        COALESCE(fc.reason, 'Message Pattern')::TEXT AS objection_reason,
        fc.conv_id
    FROM contacts ct
    LEFT JOIN LATERAL (
        SELECT conv_id, reason
        FROM FlaggedConversations
        WHERE user_identifier = ct.identifier
        ORDER BY updated_at DESC
        LIMIT 1
    ) fc ON true
    WHERE ct.tenant_id = p_tenant_id
      AND (
          ct.sentiment IN ('resistente', 'negativo', 'preocupado', 'objection')
          OR fc.conv_id IS NOT NULL
      )
    ORDER BY ct.updated_at DESC;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.get_objection_contacts(UUID) TO authenticated;
