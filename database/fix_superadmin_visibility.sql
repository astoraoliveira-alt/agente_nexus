-- =============================================
-- FIX: Super Admin Visibility via RLS
-- Purpose: Allow Super Admins to see data across all tenants (Governance Mode)
-- while maintaining isolation for regular users.
-- =============================================

-- 1. Ensure helper functions are SECURITY DEFINER (Fixes recursion/depth)
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN (SELECT tenant_id FROM public.users WHERE provider_id = auth.uid()::text LIMIT 1);
END;
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE provider_id = auth.uid()::text 
    AND role = 'super_admin'
  );
END;
$$;

-- 2. AGENTS (Update to include Super Admin)
DROP POLICY IF EXISTS "Tenant Read Agents" ON agents;
CREATE POLICY "Tenant Read Agents" ON agents
FOR SELECT USING (
  tenant_id = get_current_tenant_id()
  OR is_super_admin()
);

DROP POLICY IF EXISTS "Tenant Modify Agents" ON agents;
CREATE POLICY "Tenant Modify Agents" ON agents
FOR ALL USING (
  tenant_id = get_current_tenant_id()
  OR is_super_admin()
);

-- 3. CONVERSATIONS (Update to include Super Admin)
DROP POLICY IF EXISTS "Tenant Access Conversations" ON conversations;
CREATE POLICY "Tenant Access Conversations" ON conversations
FOR ALL USING (
  tenant_id = get_current_tenant_id()
  OR is_super_admin()
);

-- 4. MESSAGES (Update to include Super Admin)
DROP POLICY IF EXISTS "Tenant Access Messages" ON messages;
CREATE POLICY "Tenant Access Messages" ON messages
FOR ALL USING (
  tenant_id = get_current_tenant_id()
  OR is_super_admin()
);

-- 5. CONTACTS (Multi-Tenant Persistence)
-- Ensure contacts table also follows the pattern
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Contacts" ON contacts;
CREATE POLICY "Tenant Access Contacts" ON contacts
FOR ALL USING (
  tenant_id = get_current_tenant_id()
  OR is_super_admin()
);
