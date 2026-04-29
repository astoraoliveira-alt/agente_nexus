-- =============================================
-- Migration: Update RPC to return Status
-- =============================================

CREATE OR REPLACE FUNCTION get_or_create_conversation(
    p_tenant_id UUID,
    p_agent_id UUID,
    p_user_identifier VARCHAR,
    p_user_name VARCHAR
)
RETURNS JSONB  -- Changed from UUID to JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_conversation_id UUID;
    v_status VARCHAR;
BEGIN
    -- 1. Ensure User Exists
    v_user_id := get_or_create_whatsapp_user(p_tenant_id, p_user_identifier, p_user_name);

    -- 2. Find Active Conversation
    SELECT id, status INTO v_conversation_id, v_status
    FROM conversations
    WHERE tenant_id = p_tenant_id
      AND agent_id = p_agent_id
      AND user_identifier = p_user_identifier
      AND status != 'closed'
    LIMIT 1;

    -- 3. If none, create new
    IF v_conversation_id IS NULL THEN
        INSERT INTO conversations (
            tenant_id,
            agent_id,
            user_identifier,
            user_name,
            channel,
            status
        )
        VALUES (
            p_tenant_id,
            p_agent_id,
            p_user_identifier,
            p_user_name,
            'whatsapp',
            'ai_active'
        )
        RETURNING id, status INTO v_conversation_id, v_status;
    END IF;

    -- Return Object
    RETURN jsonb_build_object(
        'id', v_conversation_id,
        'status', v_status
    );
END;
$$;
