-- =============================================
-- N8N INTEGRATION RPC FUNCTIONS
-- Run this in Supabase SQL Editor to enable WhatsApp Flow
-- =============================================

-- 1. Helper: Get or Create User by Phone Identifier -> DEPRECATED/REMOVED
-- Contacts should not be created as Users.

-- 2. Helper: Get or Create Conversation (Updated for n8n Compatibility)
DROP FUNCTION IF EXISTS get_or_create_conversation(UUID, UUID, VARCHAR, VARCHAR, JSONB);

CREATE OR REPLACE FUNCTION get_or_create_conversation(
    p_tenant_id UUID,
    p_agent_id UUID,
    p_user_identifier VARCHAR,
    p_user_name VARCHAR,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_conversation_id UUID;
    v_status VARCHAR;
    v_agent_type VARCHAR;
    v_channel VARCHAR;
BEGIN
    -- 0. Get Agent Type to determine channel
    SELECT type INTO v_agent_type FROM agents WHERE id = p_agent_id;
    
    -- Map agent type to channel
    IF v_agent_type = 'whatsapp' THEN
        v_channel := 'whatsapp';
    ELSE
        v_channel := 'text';
    END IF;

    -- 1. Ensure User Exists -> SKIPPED (Contacts are not System Users)
    -- v_user_id := get_or_create_whatsapp_user(p_tenant_id, p_user_identifier, p_user_name);

    -- 2. Find LATEST Conversation (Active or Closed)
    --    We order by created_at DESC to get the most recent thread for this user/agent pair.
    SELECT id, status INTO v_conversation_id, v_status
    FROM conversations
    WHERE tenant_id = p_tenant_id
      AND agent_id = p_agent_id
      AND user_identifier = p_user_identifier
    ORDER BY created_at DESC
    LIMIT 1;

    -- 3. Logic Flow
    IF v_conversation_id IS NULL THEN
        -- Case A: No conversation exists (New User) -> Create New
        INSERT INTO conversations (
            tenant_id,
            agent_id,
            user_identifier,
            user_name,
            channel,
            status,
            metadata
        )
        VALUES (
            p_tenant_id,
            p_agent_id,
            p_user_identifier,
            p_user_name,
            v_channel::conversation_channel,
            'ai_active',
            p_metadata
        )
        RETURNING id INTO v_conversation_id;

    ELSIF v_status = 'closed' THEN
        -- Case B: Conversation exists but is CLOSED -> Re-open it
        UPDATE conversations 
        SET status = 'ai_active',   -- RE-OPENING
            metadata = COALESCE(metadata, '{}'::jsonb) || p_metadata,
            user_name = p_user_name,
            last_message_at = NOW()
        WHERE id = v_conversation_id;

    ELSE
        -- Case C: Conversation exists and is ACTIVE -> Just update metadata/timestamp
        UPDATE conversations 
        SET metadata = COALESCE(metadata, '{}'::jsonb) || p_metadata,
            user_name = p_user_name,
            last_message_at = NOW()
        WHERE id = v_conversation_id;
    END IF;

    -- 4. Sync Contact (Keep CRM updated)
    BEGIN
        INSERT INTO contacts (
            tenant_id,
            identifier,
            name,
            channel,
            extra_info,
            lifecycle_status
        )
        VALUES (
            p_tenant_id,
            p_user_identifier,
            p_user_name,
            v_agent_type,
            p_metadata,
            'lead'
        )
        ON CONFLICT (identifier) DO UPDATE
        SET name = EXCLUDED.name,
            channel = EXCLUDED.channel,
            extra_info = contacts.extra_info || EXCLUDED.extra_info;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Erro ao sincronizar contato: %', SQLERRM;
    END;

    -- Return JSON for N8N
    RETURN jsonb_build_object('id', v_conversation_id, 'reopened', (v_status = 'closed'));
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

-- 5. Close Idle Conversations (Automated Cleanup for N8N)
CREATE OR REPLACE FUNCTION close_idle_conversations(p_idle_minutes INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_closed_ids UUID[];
BEGIN
    UPDATE conversations
    SET status = 'closed',
        last_message_at = NOW()
    WHERE status != 'closed'
      AND last_message_at < (NOW() - (p_idle_minutes || ' minutes')::interval)
    RETURNING id INTO v_closed_ids;

    RETURN jsonb_build_object(
        'closed_count', array_length(v_closed_ids, 1),
        'closed_ids', COALESCE(v_closed_ids, '{}'::UUID[]),
        'timestamp', NOW()
    );
END;
$$;
