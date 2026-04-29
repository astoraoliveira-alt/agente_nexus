-- =============================================
-- ENHANCED GET_AGENT_CONTEXT RPC
-- Moves prompt logic to the platform ('Motor Burro')
-- =============================================

CREATE OR REPLACE FUNCTION get_agent_context(
    p_agent_id UUID,
    p_conversation_id UUID,
    p_history_limit INT DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_agent_config JSONB;
    v_messages JSONB;
    v_knowledge JSONB;
BEGIN
    -- 1. Get Brain Config from Agent
    SELECT brain_config INTO v_agent_config
    FROM agents
    WHERE id = p_agent_id;

    -- 2. Get Recent Messages (formatted for LLM context)
    SELECT jsonb_agg(sub) INTO v_messages
    FROM (
        SELECT sender_type, content, created_at
        FROM messages
        WHERE conversation_id = p_conversation_id
        ORDER BY created_at DESC
        LIMIT p_history_limit
    ) sub;

    -- 3. Get Knowledge Base (concatenated text for simple RAG)
    SELECT jsonb_agg(content) INTO v_knowledge
    FROM agent_knowledge
    WHERE agent_id = p_agent_id;

    -- 4. Return Combined JSON with all LLM parameters
    RETURN jsonb_build_object(
        'systemPrompt', v_agent_config->>'systemPrompt',
        'userPromptTemplate', v_agent_config->>'userPromptTemplate',
        'modelId', v_agent_config->>'modelId',
        'temperature', (v_agent_config->>'temperature')::NUMERIC,
        'maxTokens', (v_agent_config->>'maxTokens')::INT,
        'history', COALESCE(v_messages, '[]'::jsonb),
        'knowledge', COALESCE(v_knowledge, '[]'::jsonb)
    );
END;
$$;
