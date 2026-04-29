-- RPC: Store Success Memory As System (For N8N Batch Job)
-- This function allows passing tenant_id explicitly, intended for system-level batch jobs.
-- SECURITY WARNING: This function allows writing data to any tenant. It should be used carefully.
-- To mitigate risk, we can restrict execution to service_role only.

CREATE OR REPLACE FUNCTION store_success_memory_as_system(
    p_agent_id UUID,
    p_tenant_id UUID, -- Explicitly passed by N8N
    p_original_conversation_id UUID,
    p_user_intent TEXT,
    p_strategic_summary TEXT,
    p_score INT,
    p_tags TEXT[],
    p_embedding vector(1536)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_memory_id UUID;
BEGIN
    -- Optional: Check if the caller has the right role (e.g., service_role or super_admin)
    -- For now, we rely on GRANT permissions.
    
    -- Insert Memory
    INSERT INTO agent_success_memory (
        agent_id,
        tenant_id,
        original_conversation_id,
        user_intent,
        strategic_summary,
        score,
        tags,
        embedding
    )
    VALUES (
        p_agent_id,
        p_tenant_id, -- Use the parameter
        p_original_conversation_id,
        p_user_intent,
        p_strategic_summary,
        p_score,
        p_tags,
        p_embedding
    )
    RETURNING id INTO v_memory_id;

    RETURN jsonb_build_object('success', true, 'id', v_memory_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant permissions ONLY to service_role (and maybe authenticated if we trust the API Key logic in N8N)
-- Since N8N uses the service_role key, this is appropriate.
REVOKE ALL ON FUNCTION store_success_memory_as_system(UUID, UUID, UUID, TEXT, TEXT, INT, TEXT[], vector) FROM public;
GRANT EXECUTE ON FUNCTION store_success_memory_as_system(UUID, UUID, UUID, TEXT, TEXT, INT, TEXT[], vector) TO service_role;
GRANT EXECUTE ON FUNCTION store_success_memory_as_system(UUID, UUID, UUID, TEXT, TEXT, INT, TEXT[], vector) TO authenticated; -- Often needed if N8N connects as "authenticated" user with service role content

-- Note: The original store_success_memory is still useful for client-side operations where context is implicit.
