-- FIX RLS INFINITE RECURSION
-- Logic: The previous policy on 'users' table triggered a recursive lookup on itself.
-- Solution: Use a SECURITY DEFINER function to bypass RLS for the tenant lookup.

-- 1. Create Helper Function (Bypass RLS)
CREATE OR REPLACE FUNCTION get_auth_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER -- Critical: Runs as owner, bypassing RLS
SET search_path = public -- Security best practice
AS $$
DECLARE
    v_tenant_id UUID;
    v_email TEXT;
BEGIN
    -- Get email from JWT
    v_email := auth.jwt() ->> 'email';

    SELECT tenant_id INTO v_tenant_id
    FROM public.users
    WHERE 
        id = auth.uid() -- Standard match
        OR 
        email = v_email -- Fallback for migrated users (Safe because email is verified by Auth)
    LIMIT 1;
    
    RETURN v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_auth_tenant_id() TO authenticated, service_role;

-- 2. Fix Users Policy to use the function
DROP POLICY IF EXISTS "Tenant Read Users" ON users;

CREATE POLICY "Tenant Read Users" ON users
FOR SELECT
USING (
    auth.uid() = id -- Allow reading own profile
    OR
    tenant_id = get_auth_tenant_id() -- Allow reading peers in same tenant
);

-- 3. Fix Other Policies (Optimization - Optional but recommended for stability)
-- We replace the subquery (SELECT tenant_id FROM users...) with the function call

-- Companies
DROP POLICY IF EXISTS "Tenant Read Own Company" ON companies;
CREATE POLICY "Tenant Read Own Company" ON companies FOR SELECT USING (id = get_auth_tenant_id());

DROP POLICY IF EXISTS "Tenant Update Own Company" ON companies;
CREATE POLICY "Tenant Update Own Company" ON companies FOR UPDATE USING (id = get_auth_tenant_id());

-- Agents
DROP POLICY IF EXISTS "Tenant Manage Agents" ON agents;
CREATE POLICY "Tenant Manage Agents" ON agents FOR ALL USING (tenant_id = get_auth_tenant_id());

-- Contacts
DROP POLICY IF EXISTS "Tenant Manage Contacts" ON contacts;
CREATE POLICY "Tenant Manage Contacts" ON contacts FOR ALL USING (tenant_id = get_auth_tenant_id());

-- Conversations
DROP POLICY IF EXISTS "Tenant Access Conversations" ON conversations;
CREATE POLICY "Tenant Access Conversations" ON conversations FOR ALL USING (tenant_id = get_auth_tenant_id());

-- Messages
DROP POLICY IF EXISTS "Tenant Access Messages" ON messages;
CREATE POLICY "Tenant Access Messages" ON messages FOR ALL USING (tenant_id = get_auth_tenant_id());

-- Incidents
DROP POLICY IF EXISTS "Tenant Read Incidents" ON incidents;
CREATE POLICY "Tenant Read Incidents" ON incidents FOR SELECT USING (tenant_id = get_auth_tenant_id());

-- Integration Logs
DROP POLICY IF EXISTS "Tenant Access Integration Logs" ON integration_logs;
CREATE POLICY "Tenant Access Integration Logs" ON integration_logs FOR ALL USING (tenant_id = get_auth_tenant_id());

-- Audit Logs
DROP POLICY IF EXISTS "Tenant Access Audit Logs" ON audit_logs;
CREATE POLICY "Tenant Access Audit Logs" ON audit_logs FOR ALL USING (tenant_id = get_auth_tenant_id());

