-- =========================================================================
-- SYSTEM COMPONENT: get_pending_audits (Orphaned Audits Worker)
-- DESCRIPTION: Retrieves closed conversations that have no associated
--              evaluation reports. Ideal for a CRON worker (like N8N)
--              to sweep orphaned conversations and audit them in batches,
--              ensuring 100% audit coverage even if webhooks fail.
-- =========================================================================

CREATE OR REPLACE FUNCTION get_pending_audits(
    limit_count INT DEFAULT 50,
    grace_period_minutes INT DEFAULT 1 -- Only pull conversations inactive for at least X minutes
)
RETURNS TABLE (
    conversation_id UUID,
    tenant_id UUID,
    agent_id UUID,
    time_since_last_message TEXT
) 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id as conversation_id,
        c.tenant_id,
        c.agent_id,
        -- Just for N8N/Logging convenience to see how old they are
        TO_CHAR(NOW() - c.last_message_at, 'HH24:MI:SS') as time_since_last_message
    FROM 
        conversations c
    LEFT JOIN 
        evaluations e ON c.id = e.conversation_id
    WHERE 
        c.status = 'closed'
        -- No evaluation exists for this conversation
        AND e.id IS NULL
        -- Closed and inactive for at least the grace period to avoid race conditions
        AND c.last_message_at < (NOW() - (grace_period_minutes || ' minutes')::interval)
        -- Only audit conversations that actually have messages to save OpenAI tokens
        AND EXISTS (
            SELECT 1 FROM messages m WHERE m.conversation_id = c.id
        )
    ORDER BY 
        c.last_message_at ASC -- Oldest first (FIFO)
    LIMIT limit_count;
END;
$$;

-- Note for Supabase SQL Editor:
-- Copy and run this script to create the RPC. 
-- You can then test it with:
-- SELECT * FROM get_pending_audits();
