-- =============================================
-- FIX: Quality Screen RPCs
-- Purpose: Restore get_unaudited_conversations and ensure permissions
-- =============================================

-- 1. Restore the Function (In case it was dropped or not executed)
CREATE OR REPLACE FUNCTION get_unaudited_conversations(p_tenant_id UUID)
RETURNS TABLE (
    id UUID,
    agent_name VARCHAR,
    user_name VARCHAR,
    user_identifier VARCHAR,
    ended_at TIMESTAMPTZ,
    status VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        a.name as agent_name,
        c.user_name,
        c.user_identifier,
        c.last_message_at as ended_at,
        c.status::VARCHAR
    FROM conversations c
    JOIN agents a ON c.agent_id = a.id
    LEFT JOIN evaluations e ON c.id = e.conversation_id
    WHERE c.tenant_id = p_tenant_id
      AND c.status = 'closed'
      AND e.id IS NULL -- No evaluation found
    ORDER BY c.last_message_at DESC
    LIMIT 100;
END;
$$;

-- 2. Grant Permissions
-- This is a READ-ONLY function for the dashboard, so safe for authenticated users.
GRANT EXECUTE ON FUNCTION get_unaudited_conversations(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unaudited_conversations(UUID) TO service_role;
