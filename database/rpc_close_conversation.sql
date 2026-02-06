-- RPC: close_conversation
-- Purpose: Closes a single conversation by ID.
-- Usage: Called by N8N when a flow ends or by UI.

CREATE OR REPLACE FUNCTION close_conversation(p_conversation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_id UUID;
    v_rows_affected INT;
BEGIN
    UPDATE conversations
    SET status = 'closed',
        last_message_at = NOW()
    WHERE id = p_conversation_id
    RETURNING id INTO v_updated_id;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    IF v_rows_affected = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Conversation not found or already closed',
            'id', p_conversation_id
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_updated_id,
        'status', 'closed',
        'closed_at', NOW()
    );
END;
$$;
