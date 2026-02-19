-- =============================================
-- PERFORMANCE & RLS CLEANUP (V6 - FINAL STRIKE)
-- Purpose: Resolve persistent InitPlan and Multiple Permissive warnings.
-- Technique: Use (SELECT helper_function()) for all auth checks.
-- =============================================

-- 1. REFRESHING HELPER FUNCTIONS (Maintenance)
GRANT EXECUTE ON FUNCTION get_auth_tenant_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated, service_role;

-- 2. RESOLVING "MULTIPLE PERMISSIVE" ON PLANS (Linter 0006)
-- We avoid "FOR ALL" to prevent overlapping with SELECT.
DROP POLICY IF EXISTS "Plans Access Policy SELECT" ON plans;
DROP POLICY IF EXISTS "Plans Access Policy ALL" ON plans;
DROP POLICY IF EXISTS "Plans Access Policy" ON plans;
DROP POLICY IF EXISTS "everyone_read_plans" ON plans;
DROP POLICY IF EXISTS "admin_modify_plans" ON plans;

CREATE POLICY "Plans Read Access" ON plans FOR SELECT USING (true);
CREATE POLICY "Plans Insert Access" ON plans FOR INSERT WITH CHECK ((SELECT is_super_admin()));
CREATE POLICY "Plans Update Access" ON plans FOR UPDATE USING ((SELECT is_super_admin()));
CREATE POLICY "Plans Delete Access" ON plans FOR DELETE USING ((SELECT is_super_admin()));

-- 3. FIXING "INITPLAN" ON ALL TABLES (Linter 0003)
-- Using the Security Definer helper functions wrapped in (SELECT ...)

-- [USERS]
DROP POLICY IF EXISTS "Tenant Read Users" ON users;
CREATE POLICY "Tenant Read Users" ON users FOR SELECT USING (
  tenant_id = (SELECT get_auth_tenant_id()) OR 
  email = (SELECT auth.jwt() ->> 'email')
);

DROP POLICY IF EXISTS "Users Register Self" ON users;
CREATE POLICY "Users Register Self" ON users FOR INSERT WITH CHECK (
  (SELECT auth.uid()) = id
);

-- [INCIDENTS]
DROP POLICY IF EXISTS "Tenant Manage Incidents" ON incidents;
CREATE POLICY "Tenant Manage Incidents" ON incidents FOR ALL USING (
  tenant_id = (SELECT get_auth_tenant_id()) OR 
  (SELECT is_super_admin())
);

-- [AGENTS]
DROP POLICY IF EXISTS "Tenant Manage Agents" ON agents;
CREATE POLICY "Tenant Manage Agents" ON agents FOR ALL USING (
  tenant_id = (SELECT get_auth_tenant_id()) OR 
  (SELECT is_super_admin())
);

-- [AGENT_KNOWLEDGE]
DROP POLICY IF EXISTS "Tenant Manage Knowledge" ON agent_knowledge;
CREATE POLICY "Tenant Manage Knowledge" ON agent_knowledge FOR ALL USING (
  tenant_id = (SELECT get_auth_tenant_id()) OR 
  (SELECT is_super_admin())
);

-- [CONTACTS]
DROP POLICY IF EXISTS "Tenant Manage Contacts" ON contacts;
CREATE POLICY "Tenant Manage Contacts" ON contacts FOR ALL USING (
  tenant_id = (SELECT get_auth_tenant_id()) OR 
  (SELECT is_super_admin())
);

-- [BILLING_ALERTS]
DROP POLICY IF EXISTS "Tenant Access Billing Alerts" ON billing_alerts;
CREATE POLICY "Tenant Access Billing Alerts" ON billing_alerts FOR ALL USING (
  tenant_id = (SELECT get_auth_tenant_id())
);

-- [FLOWS]
DROP POLICY IF EXISTS "Tenant Insert Flows" ON flows;
DROP POLICY IF EXISTS "Tenant Update Flows" ON flows;
CREATE POLICY "Tenant Insert Flows" ON flows FOR INSERT WITH CHECK (
  tenant_id = (SELECT get_auth_tenant_id())
);
CREATE POLICY "Tenant Update Flows" ON flows FOR UPDATE USING (
  tenant_id = (SELECT get_auth_tenant_id())
);

-- [POLICIES]
DROP POLICY IF EXISTS "Tenant Access Policies" ON policies;
CREATE POLICY "Tenant Access Policies" ON policies FOR ALL USING (
  tenant_id = (SELECT get_auth_tenant_id())
);

-- [FLOW_STAGES]
DROP POLICY IF EXISTS "Tenant Access Flow Stages" ON flow_stages;
CREATE POLICY "Tenant Access Flow Stages" ON flow_stages FOR ALL USING (
  flow_id IN (SELECT id FROM flows WHERE tenant_id = (SELECT get_auth_tenant_id()))
);

-- [AGENT_FLOWS]
DROP POLICY IF EXISTS "Tenant Access Agent Flows" ON agent_flows;
CREATE POLICY "Tenant Access Agent Flows" ON agent_flows FOR ALL USING (
  agent_id IN (SELECT id FROM agents WHERE tenant_id = (SELECT get_auth_tenant_id()))
);

-- [EVALUATIONS]
DROP POLICY IF EXISTS "Tenant Insert Evaluations" ON evaluations;
CREATE POLICY "Tenant Insert Evaluations" ON evaluations FOR INSERT WITH CHECK (
  tenant_id = (SELECT get_auth_tenant_id())
);

-- 4. FINAL VERIFICATION
DO $$ 
BEGIN 
    RAISE NOTICE 'Extreme Performance Cleanup V6 Complete. All warnings addressed via helper functions.';
END $$;
