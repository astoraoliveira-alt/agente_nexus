-- RPC to fetch contacts with objections, resistance, or requests for human attendants
DROP FUNCTION IF EXISTS public.get_objection_contacts(UUID);

CREATE OR REPLACE FUNCTION public.get_objection_contacts(p_tenant_id UUID)
RETURNS TABLE (
    id UUID,
    tenant_id UUID,
    name TEXT,
    identifier TEXT,
    email TEXT,
    phone TEXT,
    avatar_url TEXT,
    tags TEXT[],
    channel TEXT,
    extra_info JSONB,
    lifecycle_status TEXT,
    status TEXT,
    sentiment TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    objection_reason TEXT
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
    SELECT DISTINCT
        ct.id,
        ct.tenant_id,
        ct.name::TEXT,
        ct.identifier::TEXT,
        ct.email::TEXT,
        ct.phone::TEXT,
        ct.avatar_url::TEXT,
        ct.tags,
        ct.channel::TEXT,
        ct.extra_info,
        ct.lifecycle_status::TEXT,
        ct.status::TEXT,
        ct.sentiment::TEXT,
        ct.created_at,
        ct.updated_at,
        COALESCE(fc.reason, 'Message Pattern')::TEXT AS objection_reason
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
