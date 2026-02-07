-- RPC: qualify_lead (Updated for Universal Sentiment)
-- Allows N8N to pass sentiment along with status and tags

CREATE OR REPLACE FUNCTION qualify_lead(
    p_conversation_id UUID,
    p_new_status VARCHAR,
    p_add_tags TEXT[] DEFAULT '{}',
    p_sentiment VARCHAR DEFAULT NULL -- New optional parameter
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
        sentiment = COALESCE(p_sentiment, sentiment), -- Update if provided, else keep existing
        updated_at = NOW()
    WHERE identifier = v_user_identifier
      AND tenant_id = v_tenant_id
    RETURNING id INTO v_contact_id;

    -- 3. Also update conversation history if sentiment is provided
    IF p_sentiment IS NOT NULL THEN
        UPDATE conversations 
        SET sentiment = p_sentiment 
        WHERE id = p_conversation_id;
    END IF;

    IF v_contact_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Contato não encontrado para este identificador');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'contact_id', v_contact_id,
        'new_status', p_new_status,
        'added_tags', p_add_tags,
        'sentiment', p_sentiment
    );
END;
$$;
