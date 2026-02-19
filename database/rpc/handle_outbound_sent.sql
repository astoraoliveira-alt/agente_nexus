-- Function to atomically handle successful outbound messages triggers by N8N
-- Creates/Updates Contact -> Gets/Creates Conversation -> Logs Message -> Updates Queue
-- Ensures data integrity and consistent state without "AI guessing"
-- Returns detailed summary of actions taken and captures errors gracefully.

CREATE OR REPLACE FUNCTION handle_outbound_sent(
    p_tenant_id UUID,
    p_agent_id UUID,
    p_contact_phone TEXT,
    p_message_content TEXT,
    p_queue_id UUID DEFAULT NULL, -- Optional: ID from outbound_queue to update
    p_campaign_id UUID DEFAULT NULL, -- Optional: context
    p_contact_name TEXT DEFAULT NULL, -- Optional: Update contact name if provided
    p_message_type TEXT DEFAULT 'text',
    p_media_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_contact_id UUID;
    v_conversation_id UUID;
    v_message_id UUID;
    v_phone_formatted TEXT;
    
    -- Status tracking for summary
    v_contact_status TEXT := 'reused';
    v_conversation_status TEXT := 'reused';
    v_queue_status TEXT := 'skipped';
    
    v_existing_name TEXT;
    v_agent_type VARCHAR;
    v_channel conversation_channel;
BEGIN
    -- 1. Validate Inputs
    IF p_tenant_id IS NULL OR p_agent_id IS NULL OR p_contact_phone IS NULL OR p_message_content IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Missing required parameters: tenant_id, agent_id, contact_phone, and message_content are mandatory.'
        );
    END IF;

    -- Basic phone cleaning (just trim)
    v_phone_formatted := TRIM(p_contact_phone);

    -- 2. Upsert Contact (Explicit logic to track status)
    -- Start by trying to find using the unique constraint (tenant_id, identifier)
    SELECT id, name INTO v_contact_id, v_existing_name
    FROM contacts
    WHERE tenant_id = p_tenant_id AND identifier = v_phone_formatted;

    IF v_contact_id IS NULL THEN
        -- Create new contact
        BEGIN
            INSERT INTO contacts (
                tenant_id, 
                phone, 
                name, 
                identifier, -- Critical for uniqueness and lookup
                created_at, 
                updated_at,
                channel
            )
            VALUES (
                p_tenant_id, 
                v_phone_formatted, 
                COALESCE(p_contact_name, v_phone_formatted), 
                v_phone_formatted, 
                NOW(), 
                NOW(),
                'whatsapp' -- Default channel
            )
            RETURNING id INTO v_contact_id;
            v_contact_status := 'created';
        EXCEPTION WHEN unique_violation THEN
            -- Handle race condition where contact was created just now
            SELECT id, name INTO v_contact_id, v_existing_name
            FROM contacts
            WHERE tenant_id = p_tenant_id AND identifier = v_phone_formatted;
            v_contact_status := 'reused';
        END;
    ELSE
        -- Update existing if name provided and different
        IF p_contact_name IS NOT NULL AND p_contact_name <> '' AND v_existing_name <> p_contact_name THEN
            UPDATE contacts 
            SET name = p_contact_name, updated_at = NOW()
            WHERE id = v_contact_id;
            v_contact_status := 'updated';
        ELSE
            v_contact_status := 'reused';
        END IF;
    END IF;

    -- 3. Manage Conversation (Get Active or Create New)
    SELECT id INTO v_conversation_id
    FROM conversations
    WHERE tenant_id = p_tenant_id
      AND agent_id = p_agent_id
      AND user_identifier = v_phone_formatted
      AND status = 'ai_active'::conversation_status
    ORDER BY last_message_at DESC
    LIMIT 1;

    IF v_conversation_id IS NULL THEN
    
        -- Get Agent Type to determine Channel
        SELECT type INTO v_agent_type FROM agents WHERE id = p_agent_id;
        
        -- Map Agent Type to Channel (Default to 'whatsapp' or 'text')
        IF v_agent_type = 'whatsapp' THEN
            v_channel := 'whatsapp'::conversation_channel;
        ELSIF v_agent_type = 'embedded' THEN
             v_channel := 'text'::conversation_channel;
        ELSE
             v_channel := 'text'::conversation_channel; -- Fallback
        END IF;

        INSERT INTO conversations (
            tenant_id, 
            agent_id, 
            user_identifier, 
            user_name,       
            channel,         
            status, 
            created_at, 
            updated_at, 
            last_message_at
        )
        VALUES (
            p_tenant_id,
            p_agent_id,
            v_phone_formatted,
            COALESCE(p_contact_name, v_phone_formatted),
            v_channel,
            'ai_active'::conversation_status,
            NOW(),
            NOW(),
            NOW()
        )
        RETURNING id INTO v_conversation_id;
        v_conversation_status := 'created';
    ELSE
        -- Update existing conversation timestamp
        UPDATE conversations SET last_message_at = NOW() WHERE id = v_conversation_id;
        v_conversation_status := 'reopened'; 
    END IF;

    -- 4. Log Message
    INSERT INTO messages (
        tenant_id,
        conversation_id,
        content,
        sender_type, -- 'ai' because it's an agent outbound
        message_type, 
        created_at
    )
    VALUES (
        p_tenant_id,
        v_conversation_id,
        p_message_content,
        'ai',
        p_message_type,
        NOW()
    )
    RETURNING id INTO v_message_id;

    -- 5. Update Outbound Queue (if ID provided)
    IF p_queue_id IS NOT NULL THEN
        -- Check if columns exist before updating? No, PL/PGSQL prepares plans.
        -- Based on schema provided in previous step (campaign_module_v2.sql), outbound_queue has:
        -- sent_at TIMESTAMP WITH TIME ZONE
        -- but NO updated_at explicitly defined in the initial CREATE TABLE.
        -- Assuming sent_at is enough.
        
        UPDATE outbound_queue
        SET 
            status = 'sent',
            sent_at = NOW()
            -- Removing updated_at as it might not be in the table
        WHERE id = p_queue_id;
        v_queue_status := 'updated';
    END IF;

    -- 6. Return Success Details
    RETURN jsonb_build_object(
        'success', true,
        'summary', jsonb_build_object(
            'contact', v_contact_status,
            'conversation', v_conversation_status,
            'message', 'created',
            'queue', v_queue_status
        ),
        'ids', jsonb_build_object(
            'contact_id', v_contact_id,
            'conversation_id', v_conversation_id,
            'message_id', v_message_id
        )
    );

EXCEPTION WHEN OTHERS THEN
    -- Return error as JSON so N8N can log specifically
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'detail', 'Transaction rolled back.'
    );
END;
$$;

-- Grant permissions to allow API access
GRANT EXECUTE ON FUNCTION handle_outbound_sent(uuid, uuid, text, text, uuid, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION handle_outbound_sent(uuid, uuid, text, text, uuid, uuid, text, text, text) TO service_role;
