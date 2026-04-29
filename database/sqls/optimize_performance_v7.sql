-- =========================================================================
-- SYSTEM COMPONENT: Performance Optimizer V7 (RLS & Indexes)
-- DESCRIPTION: Resolves extreme latency in API requests by forcing the
--              PostgreSQL planner to evaluate RLS helper functions only ONCE
--              per query instead of per row. It also adds a critical composite
--              index for `get_detailed_consumption`.
-- =========================================================================

-- 1. Optimization for 'messages' table (Fixes get_detailed_consumption 1.36s)
CREATE INDEX IF NOT EXISTS idx_messages_tenant_created ON public.messages(tenant_id, created_at);

-- 2. Optimization for 'conversations' table (Fixes conversations fetch 1.08s)
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_status ON public.conversations(tenant_id, status);

-- 3. Optimization for RLS Policies (Fixes companies fetch 2.38s and other tables)
-- By wrapping the helper functions in (SELECT function()), PG caches the result for the statement.

-- COMPANIES
DROP POLICY IF EXISTS "Tenant Read Own Company" ON companies;
CREATE POLICY "Tenant Read Own Company" ON companies 
FOR SELECT USING (
  id = (SELECT get_current_tenant_id()) 
  OR (SELECT is_super_admin())
);

DROP POLICY IF EXISTS "Tenant Update Own Company" ON companies;
CREATE POLICY "Tenant Update Own Company" ON companies 
FOR UPDATE USING (
  id = (SELECT get_current_tenant_id()) 
  OR (SELECT is_super_admin())
);

-- AGENTS
DROP POLICY IF EXISTS "Tenant Read Agents" ON agents;
CREATE POLICY "Tenant Read Agents" ON agents 
FOR SELECT USING (
  tenant_id = (SELECT get_current_tenant_id()) 
  OR (SELECT is_super_admin())
);

DROP POLICY IF EXISTS "Tenant Modify Agents" ON agents;
CREATE POLICY "Tenant Modify Agents" ON agents 
FOR ALL USING (
  tenant_id = (SELECT get_current_tenant_id()) 
  OR (SELECT is_super_admin())
);

-- CONVERSATIONS
DROP POLICY IF EXISTS "Tenant Access Conversations" ON conversations;
CREATE POLICY "Tenant Access Conversations" ON conversations 
FOR ALL USING (
  tenant_id = (SELECT get_current_tenant_id()) 
  OR (SELECT is_super_admin())
);

-- MESSAGES
DROP POLICY IF EXISTS "Tenant Access Messages" ON messages;
CREATE POLICY "Tenant Access Messages" ON messages 
FOR ALL USING (
  tenant_id = (SELECT get_current_tenant_id()) 
  OR (SELECT is_super_admin())
);

-- CONTACTS
DROP POLICY IF EXISTS "Tenant Access Contacts" ON contacts;
CREATE POLICY "Tenant Access Contacts" ON contacts 
FOR ALL USING (
  tenant_id = (SELECT get_current_tenant_id()) 
  OR (SELECT is_super_admin())
);

-- USERS
-- A user read policy must also use the wrapper.
DROP POLICY IF EXISTS "Tenant Read Users" ON users;
CREATE POLICY "Tenant Read Users" ON users 
FOR SELECT USING (
  tenant_id = (SELECT get_current_tenant_id()) 
  OR (SELECT is_super_admin())
);

-- Finally, ensure get_current_tenant_id is highly optimized
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- We use provider_id as auth.uid()::text, limit 1.
  -- This is extremely fast if idx_users_provider_id exists.
  RETURN (SELECT tenant_id FROM public.users WHERE provider_id = auth.uid()::text LIMIT 1);
END;
$$;
