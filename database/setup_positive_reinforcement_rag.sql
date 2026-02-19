-- 1. Enable Vector Extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create Agent Success Memory Table
-- Stores summarized strategies from successful conversations
CREATE TABLE IF NOT EXISTS public.agent_success_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    original_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    
    -- Knowledge Content
    user_intent VARCHAR(255),       -- e.g., "Negotiation", "Tech Support"
    strategic_summary TEXT NOT NULL,-- PII-Sanitized strategy summary
    full_dialogue_snippet TEXT,     -- Optional anonymized snippet
    
    -- Metadata
    score INT CHECK (score >= 0 AND score <= 100),
    tags TEXT[] DEFAULT '{}'::TEXT[],
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Vector Embedding (1536 dim for OpenAI text-embedding-3-small)
    embedding vector(1536),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes for Performance
-- HNSW Index for fast vector similarity search
CREATE INDEX IF NOT EXISTS idx_agent_success_memory_embedding 
ON public.agent_success_memory 
USING hnsw (embedding vector_cosine_ops);

-- Standard indexes for filtering
CREATE INDEX IF NOT EXISTS idx_agent_success_memory_tenant ON public.agent_success_memory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_success_memory_agent ON public.agent_success_memory(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_success_memory_intent ON public.agent_success_memory(user_intent);

-- 4. Enable RLS (Row Level Security)
ALTER TABLE public.agent_success_memory ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Policy: Users can only see memory from their own tenant
CREATE POLICY agent_success_memory_isolation_policy ON public.agent_success_memory
    USING (tenant_id = (SELECT public.get_auth_tenant_id()));

-- 6. RPC: Store Success Memory (Secure Insertion)
CREATE OR REPLACE FUNCTION store_success_memory(
    p_agent_id UUID,
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
    v_tenant_id UUID;
    v_memory_id UUID;
BEGIN
    -- Get Tenant ID from current user context
    v_tenant_id := (SELECT public.get_auth_tenant_id());
    
    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tenant not found');
    END IF;

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
        v_tenant_id,
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

-- Grant permissions
GRANT ALL ON TABLE public.agent_success_memory TO authenticated;
GRANT ALL ON TABLE public.agent_success_memory TO service_role;
GRANT EXECUTE ON FUNCTION store_success_memory(UUID, UUID, TEXT, TEXT, INT, TEXT[], vector) TO authenticated;
GRANT EXECUTE ON FUNCTION store_success_memory(UUID, UUID, TEXT, TEXT, INT, TEXT[], vector) TO service_role;

-- 7. RPC: Search Success Memory (RAG Retrieval)
CREATE OR REPLACE FUNCTION match_success_memory(
    p_agent_id UUID,
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
DECLARE
    v_tenant_id UUID;
BEGIN
    -- Get Tenant ID
    v_tenant_id := (SELECT public.get_auth_tenant_id());

    RETURN QUERY
    SELECT
        asm.id,
        asm.strategic_summary,
        asm.user_intent,
        1 - (asm.embedding <=> p_query_embedding) AS similarity
    FROM
        agent_success_memory asm
    WHERE
        asm.tenant_id = v_tenant_id
        AND asm.agent_id = p_agent_id
        AND 1 - (asm.embedding <=> p_query_embedding) > p_match_threshold
        AND (p_filter_intent IS NULL OR asm.user_intent = p_filter_intent)
    ORDER BY
        asm.embedding <=> p_query_embedding
    LIMIT p_match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_success_memory(UUID, vector, FLOAT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION match_success_memory(UUID, vector, FLOAT, INT, TEXT) TO service_role;
