-- =============================================
-- PERFORMANCE OPTIMIZATION FIX: RLS Admin Bypass
-- Description: Restores Super Admin visibility while maintaining performance.
-- =============================================

-- 1. Helper Function: is_super_admin()
-- Checks if the current auth user is a super_admin in public.users
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role = 'super_admin'
    );
END;
$$;

-- 2. Update RLS Policies with Super Admin Bypass

-- COMPANIES
DROP POLICY IF EXISTS "Tenant Read Own Company" ON companies;
CREATE POLICY "Tenant Read Own Company" ON companies 
FOR SELECT USING (
    (id = get_auth_tenant_id()) OR (is_super_admin())
);

-- USERS
DROP POLICY IF EXISTS "Tenant Read Users" ON users;
CREATE POLICY "Tenant Read Users" ON users 
FOR SELECT USING (
    (tenant_id = get_auth_tenant_id()) OR (is_super_admin())
);

-- AGENTS
DROP POLICY IF EXISTS "Tenant Manage Agents" ON agents;
CREATE POLICY "Tenant Manage Agents" ON agents 
FOR ALL USING (
    (tenant_id = get_auth_tenant_id()) OR (is_super_admin())
);

-- MESSAGES
DROP POLICY IF EXISTS "Tenant Access Messages" ON messages;
CREATE POLICY "Tenant Access Messages" ON messages 
FOR ALL USING (
    (tenant_id = get_auth_tenant_id()) OR (is_super_admin())
);

-- CONVERSATIONS
DROP POLICY IF EXISTS "Tenant Access Conversations" ON conversations;
CREATE POLICY "Tenant Access Conversations" ON conversations 
FOR ALL USING (
    (tenant_id = get_auth_tenant_id()) OR (is_super_admin())
);
