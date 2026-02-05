-- RPC: close_idle_conversations
-- Purpose: Closes conversations that haven't had a message in X minutes.
-- Usage: SELECT close_idle_conversations(10); -- Closes convs idle for 10+ minutes.

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
