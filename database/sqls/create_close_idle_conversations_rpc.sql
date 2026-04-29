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
    v_closed_count INT;
BEGIN
    -- Use a CTE to capture the updated IDs safely
    WITH closed_rows AS (
        UPDATE conversations
        SET status = 'closed',
            last_message_at = NOW()
        WHERE status != 'closed'
          AND last_message_at < (NOW() - (p_idle_minutes || ' minutes')::interval)
        RETURNING id
    )
    SELECT 
        COALESCE(array_agg(id), '{}'),
        COUNT(*)
    INTO 
        v_closed_ids,
        v_closed_count
    FROM closed_rows;

    RETURN jsonb_build_object(
        'status', 'success',
        'closed_count', v_closed_count,
        'closed_ids', v_closed_ids,
        'timestamp', NOW()
    );
END;
$$;
