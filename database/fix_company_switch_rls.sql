-- =============================================
-- FIX: Global Super Admin Visibility & Contact Cleanup
-- Purpose: Allow Super Admins to see all tenant data and unify identifiers.
-- =============================================

-- 1. Ensure helper functions are robust and SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE (provider_id = auth.uid()::text OR email = auth.jwt() ->> 'email')
    AND role = 'super_admin'
    AND status = 'active'
  );
END;
$$;

-- 2. Update RLS Policies for Global Visibility
-- We add 'OR is_super_admin()' to all tenant-isolated tables

-- COMPANIES
DROP POLICY IF EXISTS "Tenant Read Own Company" ON companies;
CREATE POLICY "Tenant Read Own Company" ON companies FOR SELECT USING (id = get_current_tenant_id() OR is_super_admin());

-- AGENTS
DROP POLICY IF EXISTS "Tenant Read Agents" ON agents;
CREATE POLICY "Tenant Read Agents" ON agents FOR SELECT USING (tenant_id = get_current_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "Tenant Modify Agents" ON agents;
CREATE POLICY "Tenant Modify Agents" ON agents FOR ALL USING (tenant_id = get_current_tenant_id() OR is_super_admin());

-- CONVERSATIONS
DROP POLICY IF EXISTS "Tenant Access Conversations" ON conversations;
CREATE POLICY "Tenant Access Conversations" ON conversations FOR ALL USING (tenant_id = get_current_tenant_id() OR is_super_admin());

-- MESSAGES
DROP POLICY IF EXISTS "Tenant Access Messages" ON messages;
CREATE POLICY "Tenant Access Messages" ON messages FOR ALL USING (tenant_id = get_current_tenant_id() OR is_super_admin());

-- CONTACTS
DROP POLICY IF EXISTS "Tenant Access Contacts" ON contacts;
CREATE POLICY "Tenant Access Contacts" ON contacts FOR ALL USING (tenant_id = get_current_tenant_id() OR is_super_admin());

-- KNOWLEDGE
DROP POLICY IF EXISTS "Tenant Access Knowledge" ON agent_knowledge;
CREATE POLICY "Tenant Access Knowledge" ON agent_knowledge FOR SELECT USING (tenant_id = get_current_tenant_id() OR is_super_admin());

-- INCIDENTS
DROP POLICY IF EXISTS "Tenant Read Incidents" ON incidents;
CREATE POLICY "Tenant Read Incidents" ON incidents FOR SELECT USING (tenant_id = get_current_tenant_id() OR is_super_admin());

-- EVALUATIONS
DROP POLICY IF EXISTS "Tenant Read Evaluations" ON evaluations;
CREATE POLICY "Tenant Read Evaluations" ON evaluations FOR SELECT USING (tenant_id = get_current_tenant_id() OR is_super_admin());

-- CONSUMPTION METRICS
DROP POLICY IF EXISTS "Tenant Read Consumption" ON consumption_metrics;
CREATE POLICY "Tenant Read Consumption" ON consumption_metrics FOR SELECT USING (tenant_id = get_current_tenant_id() OR is_super_admin());

-- AUDIT & INTEGRATION LOGS
DROP POLICY IF EXISTS "Tenant Access Audit Logs" ON audit_logs;
CREATE POLICY "Tenant Access Audit Logs" ON audit_logs FOR ALL USING (tenant_id = get_current_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "Tenant Access Integration Logs" ON integration_logs;
CREATE POLICY "Tenant Access Integration Logs" ON integration_logs FOR ALL USING (tenant_id = get_current_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "Tenant Read Agent Logs" ON agent_audit_logs;
CREATE POLICY "Tenant Read Agent Logs" ON agent_audit_logs FOR SELECT USING (agent_id IN (SELECT id FROM agents WHERE tenant_id = get_current_tenant_id() OR is_super_admin()));

-- 3. Contact Identifier Cleanup (Aegea specifically, but safe for all)
-- Merge contacts that have the @s.whatsapp.net suffix into the sanitized version
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT * FROM public.contacts WHERE identifier LIKE '%@s.whatsapp.net'
    LOOP
        -- If a sanitized version already exists, delete the one with suffix
        -- (Ideally we would merge tags/info, but for now we just unify to prevent UI confusion)
        IF EXISTS (SELECT 1 FROM public.contacts WHERE identifier = split_part(r.identifier, '@', 1) AND tenant_id = r.tenant_id) THEN
            DELETE FROM public.contacts WHERE id = r.id;
        ELSE
            -- If no sanitized version exists, just update this one
            UPDATE public.contacts SET identifier = split_part(r.identifier, '@', 1) WHERE id = r.id;
        END IF;
    END LOOP;
END $$;

-- 4. Ensure Carlos is linked correctly and active
UPDATE public.users 
SET status = 'active', 
    role = 'super_admin' 
WHERE email = 'carlos@davos.ai';

DO $$
BEGIN
  RAISE NOTICE 'Global RLS visibility and contact cleanup applied successfully.';
END $$;
