-- =============================================
-- SECURITY & PERFORMANCE PATCH v1
-- Purpose: Fix RLS recursion, harden policies, and optimize performance
-- Applied by: Security Auditor Agent
-- =============================================

BEGIN;

-- 1. FIX RLS RECURSION (Critical)
-- Redefine helper functions as SECURITY DEFINER to bypass RLS loops
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- Safe lookup using provider_id (auth.uid linked)
  RETURN (SELECT tenant_id FROM public.users WHERE provider_id = auth.uid()::text LIMIT 1);
END;
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE provider_id = auth.uid()::text 
    AND role = 'super_admin'
  );
END;
$$;

-- 2. HARDEN RLS POLICIES (Agent Knowledge)
-- Use the secure helper instead of direct subquery
DROP POLICY IF EXISTS "Users can view knowledge for their tenant" ON agent_knowledge;
DROP POLICY IF EXISTS "Users can manage knowledge for their tenant" ON agent_knowledge;

CREATE POLICY "Tenant Read Knowledge" ON agent_knowledge
FOR SELECT
USING (tenant_id = get_current_tenant_id());

CREATE POLICY "Tenant Manage Knowledge" ON agent_knowledge
FOR ALL
USING (tenant_id = get_current_tenant_id());

-- 3. HARDEN RLS POLICIES (Users)
-- Ensure users policy uses provider_id and safe helpers
DROP POLICY IF EXISTS "Tenant Read Users" ON public.users;
CREATE POLICY "Tenant Read Users" ON public.users FOR SELECT
USING (
  (provider_id = auth.uid()::text) OR -- Self
  (tenant_id = get_current_tenant_id()) OR -- Colleagues
  is_super_admin() -- Admin
);

-- 4. PERFORMANCE OPTIMIZATION (Indexes)
-- 4.1 Users Lookup
CREATE INDEX IF NOT EXISTS idx_users_provider_id ON public.users(provider_id);

-- 4.2 Messages Pagination (Critical for Chat History)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at DESC);

-- 4.3 Active Conversations Lookup (Used by Orchestrator)
CREATE INDEX IF NOT EXISTS idx_conversations_status_agent ON conversations(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_user_identifier ON conversations(user_identifier);

-- 4.4 Agent Knowledge Lookup (Used by Orchestrator)
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_agent_id ON agent_knowledge(agent_id);

-- 5. CONSUMPTION OPTIMIZATION
-- Ensure metric lookups are fast
CREATE INDEX IF NOT EXISTS idx_consumption_metrics_reporting ON consumption_metrics(tenant_id, recorded_at DESC);

COMMIT;
