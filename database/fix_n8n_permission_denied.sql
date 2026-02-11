-- =============================================
-- FIX: n8n RPC Permissions (close_idle_conversations)
-- Purpose: Restore execution rights for 'authenticated' role
-- as n8n is using a User Token instead of Service Role.
-- =============================================

-- 1. Restore permissions for the specific signature
GRANT EXECUTE ON FUNCTION close_idle_conversations(INT, UUID) TO authenticated;

-- 2. Also ensure other common n8n functions are accessible if used with user tokens
GRANT EXECUTE ON FUNCTION sync_vapi_call TO authenticated;

-- Note: In production, it is recommended to use the service_role key in n8n
-- to avoid permission issues and bypass RLS correctly.
