-- RPC for N8N/System to search memory with explicit tenant_context
CREATE OR REPLACE FUNCTION match_success_memory_as_system(
    p_agent_id UUID,
    p_tenant_id UUID, -- Explicitly passed by N8N
    p_query_embedding vector(1536),
    p_match_threshold FLOAT,
    p_match_count INT,
    p_filter_intent TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    strategic_summary TEXT,
    user_intent VARCHAR,
    similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        asm.id,
        asm.strategic_summary,
        asm.user_intent,
        1 - (asm.embedding <=> p_query_embedding) AS similarity
    FROM
        agent_success_memory asm
    WHERE
        asm.tenant_id = p_tenant_id
        AND asm.agent_id = p_agent_id
        AND 1 - (asm.embedding <=> p_query_embedding) > p_match_threshold
        AND (p_filter_intent IS NULL OR asm.user_intent = p_filter_intent)
    ORDER BY
        asm.embedding <=> p_query_embedding
    LIMIT p_match_count;
END;
$$;

-- Grant permissions to service_role (for N8N)
GRANT EXECUTE ON FUNCTION match_success_memory_as_system(UUID, UUID, vector, FLOAT, INT, TEXT) TO service_role;
