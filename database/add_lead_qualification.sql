-- Migration: Lead Qualification System
-- 1. Add lifecycle_status to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(50) DEFAULT 'lead';

-- 2. Create qualify_lead RPC
-- This function allows N8N to qualify a contact using the conversation_id as a reference.
CREATE OR REPLACE FUNCTION qualify_lead(
    p_conversation_id UUID,
    p_new_status VARCHAR,
    p_add_tags TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_identifier VARCHAR;
    v_tenant_id UUID;
    v_contact_id UUID;
BEGIN
    -- 1. Identify the contact from the conversation
    SELECT user_identifier, tenant_id INTO v_user_identifier, v_tenant_id
    FROM conversations
    WHERE id = p_conversation_id;

    IF v_user_identifier IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Conversa não encontrada');
    END IF;

    -- 2. Update the contact
    UPDATE contacts
    SET lifecycle_status = p_new_status,
        tags = array_cat(tags, p_add_tags),
        updated_at = NOW()
    WHERE identifier = v_user_identifier
      AND tenant_id = v_tenant_id
    RETURNING id INTO v_contact_id;

    IF v_contact_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Contato não encontrado para este identificador');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'contact_id', v_contact_id,
        'new_status', p_new_status,
        'added_tags', p_add_tags
    );
END;
$$;
