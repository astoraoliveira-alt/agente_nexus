-- 1. Full Infrastructure Check: Ensure ALL auditing columns exist
ALTER TABLE public.agent_success_memory 
ADD COLUMN IF NOT EXISTS conversation_id UUID,
ADD COLUMN IF NOT EXISTS trace_id UUID,
ADD COLUMN IF NOT EXISTS user_intent TEXT,
ADD COLUMN IF NOT EXISTS strategic_summary TEXT,
ADD COLUMN IF NOT EXISTS evaluation_score INT,
ADD COLUMN IF NOT EXISTS tags TEXT[],
ADD COLUMN IF NOT EXISTS embedding VECTOR(1536);

-- Ensure GIN index for fast filtering
CREATE INDEX IF NOT EXISTS idx_agent_success_memory_tags ON public.agent_success_memory USING GIN (tags);

-- 2. Clean up ALL existing overloads
DO $cleanup$
DECLARE
    _func_record RECORD;
BEGIN
    FOR _func_record IN 
        SELECT oid::regprocedure as format_name
        FROM pg_proc 
        WHERE proname = 'store_success_memory_as_system' 
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || _func_record.format_name;
    END LOOP;
END $cleanup$;

-- 3. Install the unified 9-parameter version (v53.1)
CREATE OR REPLACE FUNCTION public.store_success_memory_as_system(
    p_agent_id UUID,
    p_tenant_id UUID,
    p_conversation_id UUID,
    p_user_intent TEXT,
    p_strategic_summary TEXT,
    p_evaluation_score INT,
    p_tags TEXT[],
    p_embedding VECTOR(1536),
    p_trace_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.agent_success_memory (
        agent_id,
        tenant_id,
        conversation_id,
        user_intent,
        strategic_summary,
        evaluation_score,
        tags,
        embedding,
        trace_id,
        created_at
    )
    VALUES (
        p_agent_id,
        p_tenant_id,
        p_conversation_id,
        p_user_intent,
        p_strategic_summary,
        p_evaluation_score,
        p_tags,
        p_embedding,
        p_trace_id,
        NOW()
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$func$;

COMMENT ON FUNCTION public.store_success_memory_as_system IS 'Saves successful chat lessons with traceability (v53.1).';
