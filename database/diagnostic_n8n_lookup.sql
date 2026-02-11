-- =============================================
-- DIAGNOSTIC: Check Agent instances
-- Run this to see how agents are mapped to instances
-- =============================================

SELECT id, name, tenant_id, evolution_instance, status
FROM agents
ORDER BY created_at DESC;

-- =============================================
-- FIX: Secure Lookup RPC (Bypasses RLS for n8n)
-- =============================================
CREATE OR REPLACE FUNCTION get_agent_by_instance(p_instance_name TEXT)
RETURNS TABLE (
    agent_id UUID,
    agent_name VARCHAR,
    tenant_id UUID,
    brain_config JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER -- Essential for n8n lookup
SET search_path = public
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id as agent_id,
        a.name as agent_name,
        a.tenant_id,
        a.brain_config
    FROM agents a
    WHERE a.evolution_instance = p_instance_name
    LIMIT 1;
END;
$$;

-- Grant access to authenticated (n8n usually connects this way)
-- and service_role.
GRANT EXECUTE ON FUNCTION get_agent_by_instance(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_agent_by_instance(TEXT) TO service_role;
