-- Migration: Add channel to contacts and update RPC (Refined)
-- 1. Add channel column to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS channel VARCHAR(50);

-- 2. Update get_or_create_conversation (Refined version without avatar_url focus)
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
    v_agent_type VARCHAR;
    v_channel VARCHAR;
BEGIN
    -- 0. Get Agent Type to determine channel
    SELECT type INTO v_agent_type FROM agents WHERE id = p_agent_id;
    
    -- Map agent type to channel
    IF v_agent_type = 'whatsapp' THEN
        v_channel := 'whatsapp';
    ELSE
        v_channel := 'text'; -- For embedded leads
    END IF;

    -- 1. Ensure User Exists
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
    ELSE
        -- Update metadata and timestamp
        UPDATE conversations 
        SET metadata = COALESCE(metadata, '{}'::jsonb) || p_metadata,
            user_name = p_user_name,
            last_message_at = NOW()
        WHERE id = v_conversation_id;
    END IF;

    -- 4. ⚡ Sync with Contacts (CRM) - Removed avatar_url focus as per n8n payload
    BEGIN
        INSERT INTO contacts (
            tenant_id,
            identifier,
            name,
            channel,
            extra_info
        )
        VALUES (
            p_tenant_id,
            p_user_identifier,
            p_user_name,
            v_agent_type,
            p_metadata
        )
        ON CONFLICT (identifier) DO UPDATE
        SET name = EXCLUDED.name,
            channel = EXCLUDED.channel,
            extra_info = contacts.extra_info || EXCLUDED.extra_info;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Erro ao sincronizar contato: %', SQLERRM;
    END;

    RETURN jsonb_build_object('id', v_conversation_id);
END;
$$;

-- 3. Close Idle Conversations (Automated Cleanup for N8N)
CREATE OR REPLACE FUNCTION close_idle_conversations(p_idle_minutes INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_closed_count INT;
BEGIN
    UPDATE conversations
    SET status = 'closed',
        last_message_at = NOW()
    WHERE status != 'closed'
      AND last_message_at < (NOW() - (p_idle_minutes || ' minutes')::interval);

    GET DIAGNOSTICS v_closed_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'closed_count', v_closed_count,
        'timestamp', NOW()
    );
END;
$$;

-- 4. Update existing leads (Maria Joaquina fix)
UPDATE contacts 
SET channel = 'embedded' 
WHERE name ILIKE '%Maria Joaquina%' OR identifier = '11993434343';
