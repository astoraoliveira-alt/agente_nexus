-- 1. Schema Fixes (Ensure columns exist and types are compatible)
ALTER TABLE IF EXISTS public.incidents ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'medium';
ALTER TABLE IF EXISTS public.incidents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';

-- Fix 'reported_by' allowing string 'system' instead of only UUID
DO $$ 
BEGIN 
    IF (SELECT data_type FROM information_schema.columns WHERE table_name='incidents' AND column_name='reported_by') = 'uuid' THEN
        ALTER TABLE public.incidents ALTER COLUMN reported_by SET DATA TYPE TEXT USING reported_by::text;
    END IF;
END $$;

ALTER TABLE IF EXISTS public.incidents ALTER COLUMN reported_by SET DEFAULT 'system';

-- match_agent_knowledge
-- RISCO 1: Impedir context pollution forçando threshold mínimo mesmo que N8n envie 0.0
DROP FUNCTION IF EXISTS public.match_agent_knowledge(uuid, uuid, vector, double precision, integer);

CREATE OR REPLACE FUNCTION match_agent_knowledge (
  p_tenant_id UUID,
  p_agent_id UUID,
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT 
        ak.id,
        ak.content,
        ak.metadata,
        GREATEST(0, 1 - (ak.embedding <=> query_embedding)) as similarity
    FROM public.agent_knowledge ak
    WHERE ak.tenant_id = p_tenant_id
    AND ak.agent_id = p_agent_id
    AND 1 - (ak.embedding <=> query_embedding) >= GREATEST(match_threshold, 0.35)
    ORDER BY ak.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- record_security_violation
DROP FUNCTION IF EXISTS public.record_security_violation(uuid, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.record_security_violation(uuid, uuid, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.record_security_violation(
    p_tenant_id UUID,
    p_agent_id UUID,
    p_conversation_id UUID,
    p_violation_type TEXT,
    p_raw_message TEXT,
    p_severity TEXT DEFAULT 'medium'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_incident_id UUID;
BEGIN
    INSERT INTO incidents (
        tenant_id, agent_id, conversation_id, title, description, severity, status, reported_by
    ) VALUES (
        p_tenant_id, p_agent_id, p_conversation_id,
        'Security Violation: ' || p_violation_type,
        'Bloqueio Detectado. Detalhes: ' || p_raw_message,
        p_severity::incident_severity, 'open'::incident_status, 'system'
    ) RETURNING id INTO v_incident_id;

    -- Reavalia a segurança da sessão após gravar
    PERFORM public.evaluate_conversation_security(p_agent_id, p_conversation_id);

    RETURN json_build_object('success', true, 'incident_id', v_incident_id);
END;
$$;

-- evaluate_conversation_security
-- Versão estável com retorno JSONB e Pesos Davos
DROP FUNCTION IF EXISTS public.evaluate_conversation_security(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.evaluate_conversation_security(
  p_agent_id uuid,
  p_conversation_id uuid,
  p_intent text DEFAULT 'general'
)
RETURNS JSONB AS $$
DECLARE
  v_risk_score float := 0.0; 
  v_is_banned boolean := false;
  v_session_status text := 'inactive';
  v_validated_id text;
  v_allow_tool boolean;
BEGIN
  -- 1. Calcula Score de Risco (Pesos Davos: Crítico=3.0, Alto=1.0, Médio=0.3)
  SELECT COALESCE(SUM(CASE 
        WHEN severity::text = 'critical' THEN 3.0
        WHEN severity::text = 'high' THEN 1.0
        WHEN severity::text = 'medium' THEN 0.3
        ELSE 0.0
    END), 0.0)
  INTO v_risk_score
  FROM public.incidents
  WHERE conversation_id = p_conversation_id AND status::text = 'open';

  v_is_banned := (v_risk_score >= 3.0);

  -- 2. Busca Sessão Ativa
  SELECT s.status, s.validated_identifier
  INTO v_session_status, v_validated_id
  FROM public.conversation_security_sessions s
  WHERE s.conversation_id = p_conversation_id 
  AND s.status = 'active'
  AND (s.expires_at IS NULL OR s.expires_at > now())
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- 3. Lógica de Logout
  IF p_intent = 'logout' AND v_validated_id IS NOT NULL THEN
      UPDATE public.conversation_security_sessions SET status = 'inactive' WHERE conversation_id = p_conversation_id;
      v_session_status := 'inactive';
  END IF;

  -- 4. Decide se libera ferramentas
  v_allow_tool := (v_session_status = 'active' AND NOT v_is_banned);

  RETURN jsonb_build_object(
    'success', true,
    'is_banned', v_is_banned,
    'total_score', v_risk_score::int,
    'session_status', v_session_status,
    'allowToolExecution', v_allow_tool,
    'session_identifier', v_validated_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
