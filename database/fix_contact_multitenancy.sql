-- =============================================
-- FIX: Contact Multi-tenancy (V2 - Robust)
-- Purpose: Allow the same contact (phone/email) to exist across different tenants.
-- =============================================

-- 1. Correct Constraints on 'contacts' table
DO $$ 
BEGIN
    -- Drop the global unique constraint
    ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_identifier_key;
    ALTER TABLE contacts DROP CONSTRAINT IF EXISTS uq_contacts_tenant_identifier; -- In case partially applied
    DROP INDEX IF EXISTS idx_contacts_identifier;
EXCEPTION WHEN OTHERS THEN 
    NULL; 
END $$;

-- Add the correctly scoped unique constraint (PER TENANT)
ALTER TABLE contacts 
ADD CONSTRAINT uq_contacts_tenant_identifier 
UNIQUE (tenant_id, identifier);


-- 2. Clean up ALL signatures of get_or_create_conversation to prevent PostgREST ambiguity
DROP FUNCTION IF EXISTS get_or_create_conversation(UUID, UUID, VARCHAR, VARCHAR, JSONB);
DROP FUNCTION IF EXISTS get_or_create_conversation(UUID, UUID, VARCHAR, VARCHAR, JSONB, VARCHAR);
DROP FUNCTION IF EXISTS get_or_create_conversation(UUID, UUID, VARCHAR, VARCHAR, JSONB, VARCHAR, VARCHAR);


-- 3. Create the Unified, Multi-tenant Version
CREATE OR REPLACE FUNCTION get_or_create_conversation(
    p_tenant_id UUID,
    p_agent_id UUID,
    p_user_identifier VARCHAR,
    p_user_name VARCHAR,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_phone VARCHAR DEFAULT NULL,
    p_email VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
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

    -- 1. Find LATEST Conversation
    SELECT id, status INTO v_conversation_id, v_status
    FROM conversations
    WHERE tenant_id = p_tenant_id
      AND agent_id = p_agent_id
      AND user_identifier = p_user_identifier
    ORDER BY created_at DESC
    LIMIT 1;

    -- 2. Logic Flow for Conversation
    IF v_conversation_id IS NULL THEN
        INSERT INTO conversations (
            tenant_id, agent_id, user_identifier, user_name, channel, status, metadata
        )
        VALUES (
            p_tenant_id, p_agent_id, p_user_identifier, p_user_name, v_channel::conversation_channel, 'ai_active', p_metadata
        )
        RETURNING id INTO v_conversation_id;
    ELSIF v_status = 'closed' THEN
        UPDATE conversations 
        SET status = 'ai_active',
            metadata = COALESCE(metadata, '{}'::jsonb) || p_metadata,
            user_name = p_user_name,
            last_message_at = NOW()
        WHERE id = v_conversation_id;
    ELSE
        UPDATE conversations 
        SET metadata = COALESCE(metadata, '{}'::jsonb) || p_metadata,
            user_name = p_user_name,
            last_message_at = NOW()
        WHERE id = v_conversation_id;
    END IF;

    -- 3. Sync Contact (CRM) - Scoped to tenant_id
    BEGIN
        INSERT INTO contacts (
            tenant_id,
            identifier,
            name,
            phone,
            email,
            channel,
            extra_info,
            lifecycle_status
        )
        VALUES (
            p_tenant_id,
            p_user_identifier,
            p_user_name,
            COALESCE(p_phone, CASE WHEN v_channel = 'whatsapp' THEN p_user_identifier ELSE NULL END),
            p_email,
            v_agent_type,
            p_metadata,
            'lead'
        )
        ON CONFLICT (tenant_id, identifier) DO UPDATE
        SET name = EXCLUDED.name,
            phone = COALESCE(EXCLUDED.phone, contacts.phone),
            email = COALESCE(EXCLUDED.email, contacts.email),
            channel = EXCLUDED.channel,
            extra_info = contacts.extra_info || EXCLUDED.extra_info,
            updated_at = NOW();
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Erro ao sincronizar contato: %', SQLERRM;
    END;

    -- Return result
    RETURN jsonb_build_object('id', v_conversation_id, 'reopened', (COALESCE(v_status, '') = 'closed'));
END;
$$;

