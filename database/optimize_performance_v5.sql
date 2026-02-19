-- =============================================
-- PERFORMANCE & SECURITY CLEANUP (V5)
-- Purpose: Resolve "Always True" security warnings and persistent InitPlan issues.
-- =============================================

-- 1. FIXING "ALWAYS TRUE" SECURITY RISKS (Linter 0024)

-- [PLANS] - Split SELECT from other operations
DROP POLICY IF EXISTS "Plans Access Policy" ON plans;
CREATE POLICY "Plans Access Policy SELECT" ON plans FOR SELECT USING (true);
CREATE POLICY "Plans Access Policy ALL" ON plans FOR ALL 
USING ((SELECT role FROM users WHERE id = (SELECT auth.uid())) = 'super_admin')
WITH CHECK ((SELECT role FROM users WHERE id = (SELECT auth.uid())) = 'super_admin');

-- [USERS] - Fix "Register Self" being too permissive
DROP POLICY IF EXISTS "Users Register Self" ON users;
CREATE POLICY "Users Register Self" ON users FOR INSERT WITH CHECK (
  (SELECT auth.uid()) = id
);

-- 2. PERSISTENT INITPLAN FIXES (Linter 0003)
-- We use the most explicit format possible: (SELECT auth.uid()) and (SELECT (auth.jwt()->>'tenant_id')::uuid)

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

-- [FLOW_STAGES]
DROP POLICY IF EXISTS "Tenant Access Flow Stages" ON flow_stages;
CREATE POLICY "Tenant Access Flow Stages" ON flow_stages FOR ALL USING (
  flow_id IN (SELECT id FROM flows WHERE tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID))
);

-- [AGENT_FLOWS]
DROP POLICY IF EXISTS "Tenant Access Agent Flows" ON agent_flows;
CREATE POLICY "Tenant Access Agent Flows" ON agent_flows FOR ALL USING (
  agent_id IN (SELECT id FROM agents WHERE tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID))
);

-- [EVALUATIONS]
DROP POLICY IF EXISTS "Tenant Insert Evaluations" ON evaluations;
CREATE POLICY "Tenant Insert Evaluations" ON evaluations FOR INSERT WITH CHECK (
  tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::UUID)
);


-- 3. FINAL VERIFICATION
DO $$ 
BEGIN 
    RAISE NOTICE 'Extreme Security & Performance Clean-up (V5) applied.';
END $$;
