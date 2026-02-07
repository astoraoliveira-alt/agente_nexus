-- =============================================
-- UPDATE: N8N RE-ENGAGEMENT LOGIC & CONTACT DETAILS
-- Description: Updates the 'get_or_create_conversation' function to
--              handle phone/email and sync them to contacts table.
-- =============================================

CREATE OR REPLACE FUNCTION get_or_create_conversation(
    p_tenant_id UUID,
    p_agent_id UUID,
    p_user_identifier VARCHAR,
    p_user_name VARCHAR,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_phone VARCHAR DEFAULT NULL, -- New Optional Param
    p_email VARCHAR DEFAULT NULL  -- New Optional Param
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

    -- 4. Sync Contact (Keep CRM updated with Phone/Email)
    BEGIN
        INSERT INTO contacts (
            tenant_id,
            identifier,
            name,
            channel,
            extra_info,
            lifecycle_status,
            phone,  -- Save Phone
            email   -- Save Email
        )
        VALUES (
            p_tenant_id,
            p_user_identifier,
            p_user_name,
            v_agent_type,
            p_metadata,
            'lead',
            p_phone,
            p_email
        )
        ON CONFLICT (identifier) DO UPDATE
        SET name = EXCLUDED.name,
            channel = EXCLUDED.channel,
            extra_info = contacts.extra_info || EXCLUDED.extra_info,
            phone = COALESCE(EXCLUDED.phone, contacts.phone), -- Update only if new value provided
            email = COALESCE(EXCLUDED.email, contacts.email); -- Update only if new value provided
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Erro ao sincronizar contato: %', SQLERRM;
    END;

    -- Return JSON for N8N
    RETURN jsonb_build_object('id', v_conversation_id, 'reopened', (v_status = 'closed'));
END;
$$;
