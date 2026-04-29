-- =============================================
-- SECURE RLS HARDENING V2
-- Purpose: Enforce RLS on 10 public tables identified by Supabase Linter.
-- Description: Ensures strict tenant isolation and Super Admin access.
-- =============================================

-- 1. CHAT_HISTORIES_MEMORY (If it exists, likely from LangChain/n8n)
DO $$ 
BEGIN
    ALTER TABLE IF EXISTS public.chat_histories_memory ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP POLICY IF EXISTS "Tenant Access Chat Memory" ON chat_histories_memory;
-- Note: chat_histories_memory usually needs an owner_id or tenant_id. 
-- For now, if no tenant_id exists, we'll restrict to authenticated or service_role.
-- Ideally, this table should be updated to include tenant_id.

-- 2. AGENT_AUDIT_LOGS
ALTER TABLE agent_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Read Agent Logs" ON agent_audit_logs;
CREATE POLICY "Tenant Read Agent Logs" ON agent_audit_logs
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM agents 
        WHERE agents.id = agent_audit_logs.agent_id 
        AND agents.tenant_id = get_current_tenant_id()
    ) OR is_super_admin()
);

-- 3. PLAN_AUDIT_LOGS
ALTER TABLE plan_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super Admin Read Plan Logs" ON plan_audit_logs;
CREATE POLICY "Super Admin Read Plan Logs" ON plan_audit_logs
FOR SELECT USING (is_super_admin());

-- 4. BILLING_ALERTS
ALTER TABLE billing_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Billing Alerts" ON billing_alerts;
CREATE POLICY "Tenant Access Billing Alerts" ON billing_alerts
FOR ALL USING (tenant_id = get_current_tenant_id() OR is_super_admin());

-- 5. COMPANY_DAVOS_COSTS
ALTER TABLE company_davos_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super Admin Access Davos Costs" ON company_davos_costs;
CREATE POLICY "Super Admin Access Davos Costs" ON company_davos_costs
FOR ALL USING (is_super_admin()); -- Internal costs are Davos-only

-- 6. POLICIES
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Policies" ON policies;
CREATE POLICY "Tenant Access Policies" ON policies
FOR ALL USING (tenant_id = get_current_tenant_id() OR is_super_admin());

-- 7. FLOW_STAGES
ALTER TABLE flow_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Flow Stages" ON flow_stages;
CREATE POLICY "Tenant Access Flow Stages" ON flow_stages
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM flows 
        WHERE flows.id = flow_stages.flow_id 
        AND flows.tenant_id = get_current_tenant_id()
    ) OR is_super_admin()
);

-- 8. AGENT_FLOWS
ALTER TABLE agent_flows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Agent Flows" ON agent_flows;
CREATE POLICY "Tenant Access Agent Flows" ON agent_flows
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM agents 
        WHERE agents.id = agent_flows.agent_id 
        AND agents.tenant_id = get_current_tenant_id()
    ) OR is_super_admin()
);

-- 9. INTEGRATION_LOGS
ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Integration Logs" ON integration_logs;
CREATE POLICY "Tenant Access Integration Logs" ON integration_logs
FOR ALL USING (tenant_id = get_current_tenant_id() OR is_super_admin());

-- 10. AUDIT_LOGS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Audit Logs" ON audit_logs;
CREATE POLICY "Tenant Access Audit Logs" ON audit_logs
FOR SELECT USING (tenant_id = get_current_tenant_id() OR is_super_admin());

-- 11. PLANS (Hardening the existing policies)
DROP POLICY IF EXISTS "Allow public read access" ON plans;
DROP POLICY IF EXISTS "Allow public write access" ON plans;
DROP POLICY IF EXISTS "Allow public update access" ON plans;
DROP POLICY IF EXISTS "Allow public delete access" ON plans;

CREATE POLICY "Public Read Plans" ON plans FOR SELECT USING (true);
CREATE POLICY "Super Admin Modify Plans" ON plans FOR ALL USING (is_super_admin());
