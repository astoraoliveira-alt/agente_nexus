-- =============================================
-- RPC: close_idle_conversations (Refined & Robust)
-- Purpose: Closes conversations that haven't had activity in X minutes.
-- Supports: Global cleanup or Tenant-specific cleanup.
-- =============================================

-- 1. Explicitly drop OLD signatures to prevent PostgREST ambiguity (PGRST203)
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
    -- 1. Perform Update
    WITH closed_rows AS (
        UPDATE conversations
        SET status = 'closed',
            last_message_at = NOW()
        WHERE status != 'closed'
          AND last_message_at < (NOW() - (p_idle_minutes || ' minutes')::interval)
          -- Dynamic Filtering: If p_tenant_id is provided, use it. Otherwise, target all.
          AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
        RETURNING id
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
        'idle_threshold_minutes', p_idle_minutes,
        'processed_at', NOW()
    );
END;
$$;

-- Grant access to calling roles (N8N uses service_role, but for safety)
GRANT EXECUTE ON FUNCTION close_idle_conversations(INT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION close_idle_conversations(INT, UUID) TO authenticated;
