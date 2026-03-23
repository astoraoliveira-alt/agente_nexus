-- =============================================
-- RLS RECURSION FIXES & HELPERS
-- =============================================

-- Helper to check if current user is super admin without recursing
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Helper to get current user's tenant without recursing
CREATE OR REPLACE FUNCTION public.get_auth_tenant()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT tenant_id FROM public.users 
    WHERE id = auth.uid() 
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================
-- APPLYING FIXES TO TABLES
-- =============================================

-- 1. COMPANIES
DROP POLICY IF EXISTS "Tenant Read Own Company" ON companies;
CREATE POLICY "Tenant Read Own Company" ON companies 
FOR SELECT USING (
    id = public.get_auth_tenant()
    OR
    public.is_super_admin()
);

DROP POLICY IF EXISTS "Tenant Update Own Company" ON companies;
CREATE POLICY "Tenant Update Own Company" ON companies 
FOR UPDATE USING (
    id = public.get_auth_tenant()
    OR
    public.is_super_admin()
);

-- 2. USERS (The one that was recursing)
DROP POLICY IF EXISTS "Tenant Read Users" ON users;
CREATE POLICY "Tenant Read Users" ON users 
FOR SELECT USING (
    tenant_id = public.get_auth_tenant()
    OR
    public.is_super_admin()
    OR
    id = auth.uid() -- Always can see self
);

-- 3. AGENTS
DROP POLICY IF EXISTS "Tenant Manage Agents" ON agents;
CREATE POLICY "Tenant Manage Agents" ON agents 
FOR ALL USING (
    tenant_id = public.get_auth_tenant()
    OR
    public.is_super_admin()
);

-- 4. CONVERSATIONS
DROP POLICY IF EXISTS "Tenant Access Conversations" ON conversations;
CREATE POLICY "Tenant Access Conversations" ON conversations 
FOR ALL USING (
    tenant_id = public.get_auth_tenant()
    OR
    public.is_super_admin()
);

-- 5. MESSAGES
DROP POLICY IF EXISTS "Tenant Access Messages" ON messages;
CREATE POLICY "Tenant Access Messages" ON messages 
FOR ALL USING (
    tenant_id = public.get_auth_tenant()
    OR
    public.is_super_admin()
);

-- 6. EVALUATIONS
DROP POLICY IF EXISTS "Tenant Read Evaluations" ON evaluations;
CREATE POLICY "Tenant Read Evaluations" ON evaluations 
FOR SELECT USING (
    tenant_id = public.get_auth_tenant()
    OR
    public.is_super_admin()
);

-- 7. CONSUMPTION
DROP POLICY IF EXISTS "Tenant Read Consumption" ON consumption_metrics;
CREATE POLICY "Tenant Read Consumption" ON consumption_metrics 
FOR SELECT USING (
    tenant_id = public.get_auth_tenant()
    OR
    public.is_super_admin()
);
