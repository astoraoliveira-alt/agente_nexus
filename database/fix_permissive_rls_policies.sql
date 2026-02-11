-- =============================================
-- FIX PERMISSIVE RLS POLICIES
-- Purpose: Replace "always true" policies with strict tenant isolation.
-- Description: Hardens tables highlighted by Supabase Linter (Error 0024).
-- =============================================

-- 1. AGENT_KNOWLEDGE
DROP POLICY IF EXISTS "Public Read Knowledge" ON agent_knowledge;
DROP POLICY IF EXISTS "Public Manage Knowledge" ON agent_knowledge;

CREATE POLICY "Tenant Read Knowledge" ON agent_knowledge
FOR SELECT USING (tenant_id = get_current_tenant_id() OR is_super_admin());

CREATE POLICY "Tenant Manage Knowledge" ON agent_knowledge
FOR ALL USING (tenant_id = get_current_tenant_id() OR is_super_admin());

-- 2. COMPANIES
DROP POLICY IF EXISTS "Public Delete Companies" ON companies;
DROP POLICY IF EXISTS "Public Insert Companies" ON companies;

CREATE POLICY "Super Admin Delete Companies" ON companies
FOR DELETE USING (is_super_admin());

CREATE POLICY "Super Admin Insert Companies" ON companies
FOR INSERT WITH CHECK (is_super_admin());

-- 3. CONTACTS
DROP POLICY IF EXISTS "Users can insert/update contacts of their tenant" ON contacts;

CREATE POLICY "Tenant Access Contacts" ON contacts
FOR ALL USING (tenant_id = get_current_tenant_id() OR is_super_admin());

-- 4. EVALUATIONS
DROP POLICY IF EXISTS "Public Insert Evaluations" ON evaluations;

CREATE POLICY "Tenant Insert Evaluations" ON evaluations
FOR INSERT WITH CHECK (tenant_id = get_current_tenant_id() OR is_super_admin());

-- 5. FLOWS
DROP POLICY IF EXISTS "Public Insert Flows" ON flows;
DROP POLICY IF EXISTS "Public Update Flows" ON flows;

CREATE POLICY "Tenant Access Flows" ON flows
FOR ALL USING (tenant_id = get_current_tenant_id() OR is_super_admin());

-- 6. USERS (Hardening Registration)
DROP POLICY IF EXISTS "Public Register User" ON users;

CREATE POLICY "Users Register Own Profile" ON users
FOR INSERT WITH CHECK (
    auth.uid()::text = provider_id 
    OR is_super_admin()
);

-- 7. CLEANUP: Ensure all tables have RLS enabled
ALTER TABLE IF EXISTS agent_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;
