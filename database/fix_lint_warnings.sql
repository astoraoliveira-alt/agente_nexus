-- =============================================
-- DATABASE LINT FIXES & OPTIMIZATION
-- Purpose: Resolve Supabase Lint Warnings without compromising integrity
-- Fixes: 
-- 1. auth_rls_initplan (Wrap auth calls in SELECT for caching)
-- 2. multiple_permissive_policies (Consolidate overlapping policies)
-- 3. duplicate_index (Remove redundant indexes)
-- =============================================

BEGIN;

-- ---------------------------------------------------------
-- 1. FIX AUTH RLS INITPLAN (Performance)
-- ---------------------------------------------------------

-- 1.1 Users Table
DROP POLICY IF EXISTS "Tenant Read Users" ON public.users;
CREATE POLICY "Tenant Read Users" ON public.users FOR SELECT
USING (
  (provider_id = (SELECT auth.uid()::text)) OR -- Wrap in SELECT
  (tenant_id = (SELECT get_current_tenant_id())) OR -- Wrap in SELECT
  (SELECT is_super_admin()) -- Wrap in SELECT
);

-- 1.2 Evaluations Table
DROP POLICY IF EXISTS "Allow tenant read access" ON evaluations; -- Old Name
DROP POLICY IF EXISTS "Governance Read Access" ON evaluations; -- Name in Lint
DROP POLICY IF EXISTS "Public Read Evaluations" ON evaluations; -- Name in Lint
-- Recreate Single Consolidated Policy
CREATE POLICY "Tenant Read Evaluations" ON evaluations FOR SELECT
USING (
    tenant_id = (SELECT get_current_tenant_id())
);

-- 1.3 Incidents Table
-- Dropping potential old names
DROP POLICY IF EXISTS "Incidents Read Access" ON incidents;
DROP POLICY IF EXISTS "Tenant Read Incidents" ON incidents;
CREATE POLICY "Tenant Read Incidents" ON incidents FOR SELECT
USING (
    tenant_id = (SELECT get_current_tenant_id())
);

-- 1.4 Consumption Metrics
DROP POLICY IF EXISTS "Consumption Read Access" ON consumption_metrics;
CREATE POLICY "Tenant Read Consumption" ON consumption_metrics FOR SELECT
USING (
    tenant_id = (SELECT get_current_tenant_id())
);


-- ---------------------------------------------------------
-- 2. FIX MULTIPLE PERMISSIVE POLICIES (Consolidation)
-- ---------------------------------------------------------

-- 2.1 Agent Knowledge
-- Drop ALL existing policies to ensure clean slate
DROP POLICY IF EXISTS "Users can view knowledge for their tenant" ON agent_knowledge;
DROP POLICY IF EXISTS "Users can manage knowledge for their tenant" ON agent_knowledge;
DROP POLICY IF EXISTS "Public Manage Knowledge" ON agent_knowledge;
DROP POLICY IF EXISTS "Tenant Manage Knowledge" ON agent_knowledge;
DROP POLICY IF EXISTS "Public Read Knowledge" ON agent_knowledge;
DROP POLICY IF EXISTS "Tenant Read Knowledge" ON agent_knowledge;

-- Create ONE Consolidated Policy for ALL actions (Select, Insert, Update, Delete)
-- Logic: If you belong to the tenant, you can manage the knowledge.
CREATE POLICY "Tenant Manage Knowledge" ON agent_knowledge
FOR ALL
USING (
    tenant_id = (SELECT get_current_tenant_id())
);

-- 2.2 Agents
DROP POLICY IF EXISTS "Tenant Modify Agents" ON agents;
DROP POLICY IF EXISTS "Tenant Read Agents" ON agents;
-- Consolidate
CREATE POLICY "Tenant Manage Agents" ON agents
FOR ALL
USING (
    tenant_id = (SELECT get_current_tenant_id())
);

-- 2.3 Contacts
DROP POLICY IF EXISTS "Tenant Access Contacts" ON contacts;
DROP POLICY IF EXISTS "Users can insert/update contacts of their tenant" ON contacts;
DROP POLICY IF EXISTS "Users can view contacts of their tenant" ON contacts;
-- Consolidate
CREATE POLICY "Tenant Manage Contacts" ON contacts
FOR ALL
USING (
    tenant_id = (SELECT get_current_tenant_id())
);

-- 2.4 Plans
-- Plans are usually read-only for public/tenants, writable by Super Admin
DROP POLICY IF EXISTS "Public Read Plans" ON plans;
DROP POLICY IF EXISTS "Super Admin Modify Plans" ON plans;

CREATE POLICY "everyone_read_plans" ON plans
FOR SELECT
USING (true); -- Plans are public catalog

CREATE POLICY "admin_modify_plans" ON plans
FOR ALL
USING (
    (SELECT is_super_admin())
);


-- ---------------------------------------------------------
-- 3. FIX DUPLICATE INDEXES
-- ---------------------------------------------------------

-- 3.1 Agent Knowledge (agent_id)
-- idx_agent_knowledge_agent is the duplicate of idx_agent_knowledge_agent_id
DROP INDEX IF EXISTS idx_agent_knowledge_agent;

COMMIT;
