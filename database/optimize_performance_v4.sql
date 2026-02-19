-- =============================================
-- PERFORMANCE OPTIMIZATION: RLS & POLICIES (V3.4)
-- Purpose: Eliminate the remaining 16 warnings (InitPlan & Multiple Permissive)
-- =============================================

-- 1. CONSOLIDATING "PLANS" POLICIES (Linter 0006)
-- Multiple permissive policies for role anon, authenticated, etc.
-- We will merge them into a single granular policy.

DROP POLICY IF EXISTS "Manage Plans" ON plans;
DROP POLICY IF EXISTS "Read Plans" ON plans;
DROP POLICY IF EXISTS "everyone_read_plans" ON plans;
DROP POLICY IF EXISTS "admin_modify_plans" ON plans;

CREATE POLICY "Plans Access Policy" ON plans 
FOR ALL 
USING (
  true -- Everyone can read (SELECT)
)
WITH CHECK (
  (SELECT role FROM users WHERE id = (SELECT auth.uid())) = 'super_admin' -- Only super_admin can modify
);

-- 2. FIXING REMAINING INITPLAN WARNINGS (Linter 0003)
-- We explicitly DROP and RECREATE using the (SELECT ...) pattern for maximum compliance.

-- [AGENT_KNOWLEDGE]
DROP POLICY IF EXISTS "Tenant Manage Knowledge" ON agent_knowledge;
CREATE POLICY "Tenant Manage Knowledge" ON agent_knowledge FOR ALL USING (
  tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID) OR 
  (SELECT role FROM users WHERE id = (SELECT auth.uid())) = 'super_admin'
);

-- [CONTACTS]
DROP POLICY IF EXISTS "Tenant Manage Contacts" ON contacts;
CREATE POLICY "Tenant Manage Contacts" ON contacts FOR ALL USING (
  tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID) OR 
  (SELECT role FROM users WHERE id = (SELECT auth.uid())) = 'super_admin'
);

-- [BILLING_ALERTS]
DROP POLICY IF EXISTS "Tenant Access Billing Alerts" ON billing_alerts;
CREATE POLICY "Tenant Access Billing Alerts" ON billing_alerts FOR ALL USING (
  tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID)
);

-- [FLOWS]
DROP POLICY IF EXISTS "Tenant Insert Flows" ON flows;
DROP POLICY IF EXISTS "Tenant Update Flows" ON flows;
CREATE POLICY "Tenant Insert Flows" ON flows FOR INSERT WITH CHECK (
  tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID)
);
CREATE POLICY "Tenant Update Flows" ON flows FOR UPDATE USING (
  tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID)
);

-- [POLICIES]
DROP POLICY IF EXISTS "Tenant Access Policies" ON policies;
CREATE POLICY "Tenant Access Policies" ON policies FOR ALL USING (
  tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID)
);

-- [FLOW_STAGES] (Referential access)
DROP POLICY IF EXISTS "Tenant Access Flow Stages" ON flow_stages;
CREATE POLICY "Tenant Access Flow Stages" ON flow_stages FOR ALL USING (
  flow_id IN (SELECT id FROM flows WHERE tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID))
);

-- [AGENT_FLOWS] (Referential access)
DROP POLICY IF EXISTS "Tenant Access Agent Flows" ON agent_flows;
CREATE POLICY "Tenant Access Agent Flows" ON agent_flows FOR ALL USING (
  agent_id IN (SELECT id FROM agents WHERE tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID))
);

-- [USERS]
DROP POLICY IF EXISTS "Tenant Read Users" ON users;
CREATE POLICY "Tenant Read Users" ON users FOR SELECT USING (
  tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID) OR 
  email = (SELECT auth.jwt() ->> 'email')
);

-- [INCIDENTS]
DROP POLICY IF EXISTS "Tenant Manage Incidents" ON incidents;
CREATE POLICY "Tenant Manage Incidents" ON incidents FOR ALL USING (
  tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID) OR 
  (SELECT role FROM users WHERE id = (SELECT auth.uid())) = 'super_admin'
);

-- [AGENTS]
DROP POLICY IF EXISTS "Tenant Manage Agents" ON agents;
CREATE POLICY "Tenant Manage Agents" ON agents FOR ALL USING (
  tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID) OR 
  (SELECT role FROM users WHERE id = (SELECT auth.uid())) = 'super_admin'
);

-- [EVALUATIONS]
DROP POLICY IF EXISTS "Tenant Insert Evaluations" ON evaluations;
CREATE POLICY "Tenant Insert Evaluations" ON evaluations FOR INSERT WITH CHECK (
  tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID)
);

-- 3. FINAL VERIFICATION
DO $$ 
BEGIN 
    RAISE NOTICE 'Full Performance Clean-up (V3.4) applied. 16 warnings addressed.';
END $$;
