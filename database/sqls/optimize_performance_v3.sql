-- =============================================
-- PERFORMANCE OPTIMIZATION: RLS & INDEXES (V3.3)
-- Purpose: Resolve Supabase Performance Advisor warnings (0003, 0006, 0009)
-- Fix: Addressing missing 'tenant_id' in junction tables.
-- =============================================

-- 1. FIXING RLS INITPLAN (Linter 0003) & REDUNDANCY (Linter 0006)
-- Pattern: Wrap auth calls in (SELECT auth.uid()) and merge permissive policies.

-- [USERS]
DROP POLICY IF EXISTS "Allow read by email" ON users;
DROP POLICY IF EXISTS "Tenant Read Users" ON users;
DROP POLICY IF EXISTS "Users Register Self" ON users;
CREATE POLICY "Tenant Read Users" ON users FOR SELECT USING (
  tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID) OR 
  email = (SELECT auth.jwt() ->> 'email')
);
CREATE POLICY "Users Register Self" ON users FOR INSERT WITH CHECK (true); -- Usually handled by triggers or specific logic

-- [INCIDENTS]
DROP POLICY IF EXISTS "Tenant Insert Incidents" ON incidents;
DROP POLICY IF EXISTS "Tenant Update Incidents" ON incidents;
DROP POLICY IF EXISTS "Tenant Delete Incidents" ON incidents;
DROP POLICY IF EXISTS "Super Admin Manage Incidents" ON incidents;
DROP POLICY IF EXISTS "Tenant Read Incidents" ON incidents;

CREATE POLICY "Tenant Manage Incidents" ON incidents FOR ALL USING (
  tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID) OR 
  (SELECT role FROM users WHERE id = (SELECT auth.uid())) = 'super_admin'
);

-- [AGENTS]
DROP POLICY IF EXISTS "Tenant Manage Agents" ON agents;
DROP POLICY IF EXISTS "Tenant Modify Agents" ON agents;
DROP POLICY IF EXISTS "Tenant Read Agents" ON agents;
CREATE POLICY "Tenant Manage Agents" ON agents FOR ALL USING (
  tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID) OR 
  (SELECT role FROM users WHERE id = (SELECT auth.uid())) = 'super_admin'
);

-- [AGENT_KNOWLEDGE]
DROP POLICY IF EXISTS "Tenant Access Knowledge" ON agent_knowledge;
DROP POLICY IF EXISTS "Tenant Manage Knowledge" ON agent_knowledge;
CREATE POLICY "Tenant Manage Knowledge" ON agent_knowledge FOR ALL USING (
  tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID) OR 
  (SELECT role FROM users WHERE id = (SELECT auth.uid())) = 'super_admin'
);

-- [CONTACTS]
DROP POLICY IF EXISTS "Tenant Access Contacts" ON contacts;
DROP POLICY IF EXISTS "Tenant Manage Contacts" ON contacts;
CREATE POLICY "Tenant Manage Contacts" ON contacts FOR ALL USING (
  tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID) OR 
  (SELECT role FROM users WHERE id = (SELECT auth.uid())) = 'super_admin'
);

-- [PLANS]
DROP POLICY IF EXISTS "admin_modify_plans" ON plans;
DROP POLICY IF EXISTS "everyone_read_plans" ON plans;
CREATE POLICY "Manage Plans" ON plans FOR ALL USING (
  (SELECT role FROM users WHERE id = (SELECT auth.uid())) = 'super_admin'
);
CREATE POLICY "Read Plans" ON plans FOR SELECT USING (true);

-- 2. REMOVING DUPLICATE INDEXES (Linter 0009)
DROP INDEX IF EXISTS public.idx_messages_conversation_id;

-- 3. OTHER INITPLAN FIXES
ALTER POLICY "Super Admin Delete Companies" ON companies USING ((SELECT role FROM users WHERE id = (SELECT auth.uid())) = 'super_admin');
ALTER POLICY "Super Admin Insert Companies" ON companies WITH CHECK ((SELECT role FROM users WHERE id = (SELECT auth.uid())) = 'super_admin');
ALTER POLICY "Super Admin Access Davos Costs" ON company_davos_costs USING ((SELECT role FROM users WHERE id = (SELECT auth.uid())) = 'super_admin');
ALTER POLICY "Tenant Access Billing Alerts" ON billing_alerts USING (tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID));
ALTER POLICY "Tenant Access Policies" ON policies USING (tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID));
ALTER POLICY "Tenant Insert Flows" ON flows WITH CHECK (tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID));
ALTER POLICY "Tenant Update Flows" ON flows USING (tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID));

-- Fix for junction tables (without direct tenant_id column)
ALTER POLICY "Tenant Access Flow Stages" ON flow_stages USING (
  flow_id IN (SELECT id FROM flows WHERE tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID))
);
ALTER POLICY "Tenant Access Agent Flows" ON agent_flows USING (
  agent_id IN (SELECT id FROM agents WHERE tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID))
);

ALTER POLICY "Tenant Insert Evaluations" ON evaluations WITH CHECK (tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID));
ALTER POLICY "Super Admin Read Plan Logs" ON plan_audit_logs USING ((SELECT role FROM users WHERE id = (SELECT auth.uid())) = 'super_admin');

-- 4. VERIFICATION
DO $$ 
BEGIN 
    RAISE NOTICE 'Performance optimization script V3.3 applied successfully.';
END $$;
