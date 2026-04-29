-- =============================================
-- VECTORS: Similarity Search (RAG)
-- Purpose: Enable n8n and other services to search the knowledge base using vectors.
-- =============================================

-- 1. Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create the match_documents function
-- This signature is specifically designed to be compatible with n8n's Supabase Vector Store node.
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding vector(1536),
  match_count int,
  filter jsonb DEFAULT '{}'
) RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT
    id,
    content,
    -- Build metadata object for n8n to consume
    jsonb_build_object(
      'agent_id', agent_id,
      'tenant_id', tenant_id,
      'name', name,
      'file_type', file_type
    ) AS metadata,
    -- Calculate cosine similarity (1 - cosine distance)
    1 - (agent_knowledge.embedding <=> query_embedding) AS similarity
  FROM agent_knowledge
  WHERE 
    -- Apply optional metadata filtering
    (
      filter = '{}' OR (
        (filter->>'agent_id' IS NULL OR agent_id::text = filter->>'agent_id') AND
        (filter->>'tenant_id' IS NULL OR tenant_id::text = filter->>'tenant_id')
      )
    )
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- 3. Grant permissions
GRANT EXECUTE ON FUNCTION match_documents TO anon;
GRANT EXECUTE ON FUNCTION match_documents TO authenticated;
GRANT EXECUTE ON FUNCTION match_documents TO service_role;
