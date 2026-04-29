-- =============================================
-- Migration: Update close_idle_conversations to use Agent's session_timeout_seconds
-- Purpose: Closes conversations using the specific Agent's timeout, falling back
--          to the global p_idle_minutes if the agent has no timeout set.
-- =============================================

DROP FUNCTION IF EXISTS close_idle_conversations(INT);
DROP FUNCTION IF EXISTS close_idle_conversations(INT, UUID);

CREATE OR REPLACE FUNCTION close_idle_conversations(
    p_idle_minutes INT,
    p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_closed_ids UUID[];
    v_closed_count INT;
BEGIN
    -- 1. Perform Update joining with the agents table
    WITH closed_rows AS (
        UPDATE conversations c
        SET status = 'closed',
            last_message_at = NOW()
        FROM agents a
        WHERE c.agent_id = a.id
          AND c.status != 'closed'
          -- Dynamically use the Agent's specific timeout in seconds, or fallback to p_idle_minutes
          AND c.last_message_at < (NOW() - make_interval(secs := COALESCE(a.session_timeout_seconds, p_idle_minutes * 60)))
          -- Dynamic Filtering: If p_tenant_id is provided, use it. Otherwise, target all.
          AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
        RETURNING c.id
    )
    SELECT 
        COALESCE(array_agg(id), '{}'),
        COUNT(*)
    INTO 
        v_closed_ids,
        v_closed_count
    FROM closed_rows;

    -- 2. Log to Audit (Optional but recommended for large systems)
    -- IF v_closed_count > 0 THEN
    --     INSERT INTO audit_logs (action, target_type, details)
    --     VALUES ('cleanup.idle', 'conversations', 'Closed ' || v_closed_count || ' idle conversations');
    -- END IF;

    -- 3. Return Diagnostic Info
    RETURN jsonb_build_object(
        'success', true,
        'closed_count', v_closed_count,
        'closed_ids', v_closed_ids,
        'filter_tenant_id', p_tenant_id,
        'global_fallback_minutes', p_idle_minutes,
        'processed_at', NOW()
    );
END;
$$;

-- Grant access to calling roles
GRANT EXECUTE ON FUNCTION close_idle_conversations(INT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION close_idle_conversations(INT, UUID) TO authenticated;
