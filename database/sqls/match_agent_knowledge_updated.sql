-- RISCO 1: Impedir context pollution forçando threshold mínimo mesmo que N8n envie 0.0
CREATE OR REPLACE FUNCTION match_agent_knowledge (
  p_tenant_id UUID,
  p_agent_id UUID,
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  name varchar,
  content text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  /* 
   * SECURITY: 
   * Se o N8N enviar 0.0 (match_threshold configurado errado no workflow),
   * o banco de dados vai segurar um threshold de segurança de pelo menos 0.65 
   * para não retornar qualquer lixo de documento da base RAG.
   */
  RETURN QUERY
  SELECT
    ak.id,
    ak.name,
    ak.content,
    1 - (ak.embedding <=> query_embedding) AS similarity
  FROM agent_knowledge ak
  WHERE ak.tenant_id = p_tenant_id
    AND ak.agent_id = p_agent_id
    AND 1 - (ak.embedding <=> query_embedding) > GREATEST(match_threshold, 0.65)
  ORDER BY ak.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- RISCO 5: Garantir que memória de sucesso só seja retornada se a similaridade superar segurança
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
        AND 1 - (asm.embedding <=> p_query_embedding) > GREATEST(p_match_threshold, 0.65)
        AND (p_filter_intent IS NULL OR asm.user_intent = p_filter_intent)
    ORDER BY
        asm.embedding <=> p_query_embedding
    LIMIT p_match_count;
END;
$$;
