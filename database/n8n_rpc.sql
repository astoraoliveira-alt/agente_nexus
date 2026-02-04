-- =============================================
-- N8N INTEGRATION RPC FUNCTIONS
-- Run this in Supabase SQL Editor to enable WhatsApp Flow
-- =============================================

-- 1. Helper: Get or Create User by Phone Identifier
CREATE OR REPLACE FUNCTION get_or_create_whatsapp_user(
    p_tenant_id UUID,
    p_phone VARCHAR,
    p_name VARCHAR
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Try to find existing user by identifier (Phone)
    SELECT id INTO v_user_id
    FROM users
    WHERE tenant_id = p_tenant_id
      AND email = p_phone || '@whatsapp.gw'; -- Dummy email pattern for now, or add a pure identifier column in users

    -- If not found, create one
    IF v_user_id IS NULL THEN
        INSERT INTO users (tenant_id, email, full_name, role, is_active)
        VALUES (
            p_tenant_id,
            p_phone || '@whatsapp.gw', -- Hack to satisfy Unique Email constraint for now
            p_name,
            'viewer', -- Default role for end-users
            true
        )
        RETURNING id INTO v_user_id;
    END IF;

    RETURN v_user_id;
END;
$$;

-- 2. Helper: Get or Create Conversation
CREATE OR REPLACE FUNCTION get_or_create_conversation(
    p_tenant_id UUID,
    p_agent_id UUID,
    p_user_identifier VARCHAR,
    p_user_name VARCHAR
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_conversation_id UUID;
BEGIN
    -- 1. Ensure User Exists
    -- Note: We store the raw phone in user_identifier column of conversation
    -- But we also link to a User record for consistency
    v_user_id := get_or_create_whatsapp_user(p_tenant_id, p_user_identifier, p_user_name);

    -- 2. Find Active Conversation
    SELECT id INTO v_conversation_id
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
        RETURNING id INTO v_conversation_id;
    END IF;

    RETURN v_conversation_id;
END;
$$;

-- 3. Append Message (Safe Insert)
CREATE OR REPLACE FUNCTION append_message(
    p_conversation_id UUID,
    p_tenant_id UUID,
    p_sender_type VARCHAR,
    p_content TEXT,
    p_message_type VARCHAR DEFAULT 'text'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_msg_id UUID;
BEGIN
    INSERT INTO messages (
        conversation_id,
        tenant_id,
        sender_type,
        content,
        message_type,
        created_at
    )
    VALUES (
        p_conversation_id,
        p_tenant_id,
        p_sender_type,
        p_content,
        p_message_type,
        NOW()
    )
    RETURNING id INTO v_msg_id;

    -- Update conversation timestamp
    UPDATE conversations
    SET last_message_at = NOW()
    WHERE id = p_conversation_id;

    RETURN v_msg_id;
END;
$$;

-- 4. Get Agent Context (Prompt + History)
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
BEGIN
    -- Get Brain Config
    SELECT brain_config INTO v_agent_config
    FROM agents
    WHERE id = p_agent_id;

    -- Get Recent Messages
    SELECT jsonb_agg(sub) INTO v_messages
    FROM (
        SELECT sender_type, content, created_at
        FROM messages
        WHERE conversation_id = p_conversation_id
        ORDER BY created_at DESC
        LIMIT p_history_limit
    ) sub;

    -- Return Combined
    RETURN jsonb_build_object(
        'system_prompt', v_agent_config->>'system_prompt',
        'model', v_agent_config->>'model_id',
        'history', v_messages
    );
END;
$$;
