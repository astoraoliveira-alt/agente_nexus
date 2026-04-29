-- =============================================
-- SECURE RLS ENFORCEMENT (PRODUCTION GRADE)
-- Purpose: Replace permissive "Dev" policies with strict Tenant Isolation
-- Usage: Run this script to LOCK DOWN the database.
-- =============================================

-- HELPER: Function to get current user's tenant_id safely
-- This avoids repeating the subquery in every policy
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT tenant_id FROM public.users WHERE provider_id = auth.uid()::text LIMIT 1;
$$;

-- HELPER: Function to check if user is super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE provider_id = auth.uid()::text 
    AND role = 'super_admin'
  );
$$;

-- =============================================
-- 1. COMPANIES (Tenant Isolation)
-- =============================================
DROP POLICY IF EXISTS "Public Read Companies" ON companies;
DROP POLICY IF EXISTS "Public Update Companies" ON companies;

CREATE POLICY "Tenant Read Own Company" ON companies
FOR SELECT
USING (
  id = get_current_tenant_id() 
  OR is_super_admin()
);

CREATE POLICY "Tenant Update Own Company" ON companies
FOR UPDATE
USING (
  id = get_current_tenant_id() 
  OR is_super_admin()
);

-- =============================================
-- 2. USERS (Profile Visibility)
-- =============================================
DROP POLICY IF EXISTS "Public Read Users" ON users;
DROP POLICY IF EXISTS "Public Update Users" ON users;
DROP POLICY IF EXISTS "Public Insert Users" ON users;
DROP POLICY IF EXISTS "Public Delete Users" ON users;

-- Anyone can insert (Registration), but status will be pending
CREATE POLICY "Public Register User" ON users FOR INSERT WITH CHECK (true);

-- Users can read their own profile OR other users in same tenant
CREATE POLICY "Tenant Read Users" ON users
FOR SELECT
USING (
  tenant_id = get_current_tenant_id()
  OR id = auth.uid()::uuid -- Allow reading own profile even if pending
  OR is_super_admin()
);

-- =============================================
-- 3. AGENTS (Strict Tenant Scope)
-- =============================================
DROP POLICY IF EXISTS "Public Read Agents" ON agents;
DROP POLICY IF EXISTS "Public Insert Agents" ON agents;
DROP POLICY IF EXISTS "Public Update Agents" ON agents;
DROP POLICY IF EXISTS "Public Delete Agents" ON agents;

CREATE POLICY "Tenant Read Agents" ON agents
FOR SELECT USING (tenant_id = get_current_tenant_id());

CREATE POLICY "Tenant Modify Agents" ON agents
FOR ALL USING (tenant_id = get_current_tenant_id());

-- =============================================
-- 4. CONVERSATIONS & MESSAGES
-- =============================================
DROP POLICY IF EXISTS "Public Read Conversations" ON conversations;
DROP POLICY IF EXISTS "Public Insert Conversations" ON conversations;
DROP POLICY IF EXISTS "Public Update Conversations" ON conversations;

CREATE POLICY "Tenant Access Conversations" ON conversations
FOR ALL USING (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS "Public Read Messages" ON messages;
DROP POLICY IF EXISTS "Public Insert Messages" ON messages;

CREATE POLICY "Tenant Access Messages" ON messages
FOR ALL USING (tenant_id = get_current_tenant_id());

