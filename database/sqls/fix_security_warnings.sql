-- =============================================
-- SECURITY HARDENING & LINT REMEDIATION
-- Purpose: Fix 'function_search_path_mutable' and 'rls_policy_always_true'
-- =============================================

BEGIN;

-- ---------------------------------------------------------
-- 1. FIX FUNCTION SEARCH PATHS (Mutable Warning)
-- Security: Prevents search_path hijacking by malicious users.
-- ---------------------------------------------------------

ALTER FUNCTION public.record_usage SET search_path = public;
-- Fix Ambiguous Function: qualify_lead (Overload 1: Basic)
ALTER FUNCTION public.qualify_lead(UUID, VARCHAR, TEXT[]) SET search_path = public;
-- Fix Ambiguous Function: qualify_lead (Overload 2: With Sentiment)
ALTER FUNCTION public.qualify_lead(UUID, VARCHAR, TEXT[], VARCHAR) SET search_path = public;
-- Fix Ambiguous Function: check_consumption_allowance (Overload 1: Enum)
ALTER FUNCTION public.check_consumption_allowance(UUID, metric_type, NUMERIC) SET search_path = public;
-- Fix Ambiguous Function: check_consumption_allowance (Overload 2: Text - Potential Legacy)
-- ALTER FUNCTION public.check_consumption_allowance(UUID, TEXT, NUMERIC) SET search_path = public; 

ALTER FUNCTION public.get_detailed_consumption SET search_path = public; 
ALTER FUNCTION public.get_agent_usage_stats SET search_path = public;
ALTER FUNCTION public.get_conversation_transcript(UUID) SET search_path = public;
ALTER FUNCTION public.get_agent_context SET search_path = public;

-- Fix Ambiguous Function: save_evaluation (Overload 1: Standard)
ALTER FUNCTION public.save_evaluation(UUID, INT, TEXT, TEXT[], JSONB, VARCHAR) SET search_path = public;
-- Fix Ambiguous Function: save_evaluation (Overload 2: With Sentiment)
ALTER FUNCTION public.save_evaluation(UUID, INT, TEXT, TEXT[], JSONB, VARCHAR, VARCHAR) SET search_path = public;

ALTER FUNCTION public.handle_knowledge_embedding SET search_path = public;

ALTER FUNCTION public.sync_vapi_call SET search_path = public;

ALTER FUNCTION public.append_message SET search_path = public;
ALTER FUNCTION public.audit_agent_changes SET search_path = public;
ALTER FUNCTION public.expire_stale_conversations SET search_path = public;
ALTER FUNCTION public.sync_vapi_call_debug SET search_path = public;
ALTER FUNCTION public.get_tenant_usage_summary SET search_path = public;
ALTER FUNCTION public.delete_company_cascade SET search_path = public;
ALTER FUNCTION public.get_or_create_conversation SET search_path = public;

-- Fix Ambiguous Function: get_financial_report
ALTER FUNCTION public.get_financial_report(INT, INT) SET search_path = public;

ALTER FUNCTION public.audit_plan_changes SET search_path = public;
ALTER FUNCTION public.close_conversation SET search_path = public;
ALTER FUNCTION public.close_idle_conversations SET search_path = public;
ALTER FUNCTION public.get_companies_overview SET search_path = public;
ALTER FUNCTION public.match_documents SET search_path = public;


-- ---------------------------------------------------------
-- 2. FIX PERMISSIVE RLS (Always True Warning)
-- Security: Replaces "Public" access with "Authenticated" or "None".
-- ---------------------------------------------------------

-- 2.1 Companies (Dangerous!)
DROP POLICY IF EXISTS "Public Delete Companies" ON companies;
CREATE POLICY "Super Admin Delete Companies" ON companies
FOR DELETE USING (
  (SELECT is_super_admin())
);

DROP POLICY IF EXISTS "Public Insert Companies" ON companies;
CREATE POLICY "Super Admin Insert Companies" ON companies
FOR INSERT WITH CHECK (
  (SELECT is_super_admin())
);

-- 2.2 Evaluations
DROP POLICY IF EXISTS "Public Insert Evaluations" ON evaluations;
CREATE POLICY "Tenant Insert Evaluations" ON evaluations
FOR INSERT WITH CHECK (
  tenant_id = (SELECT get_current_tenant_id())
);

-- 2.3 Flows
DROP POLICY IF EXISTS "Public Insert Flows" ON flows;
CREATE POLICY "Tenant Insert Flows" ON flows
FOR INSERT WITH CHECK (
  tenant_id = (SELECT get_current_tenant_id())
);

DROP POLICY IF EXISTS "Public Update Flows" ON flows;
CREATE POLICY "Tenant Update Flows" ON flows
FOR UPDATE USING (
  tenant_id = (SELECT get_current_tenant_id())
);

-- 2.4 Users
DROP POLICY IF EXISTS "Public Register User" ON users;
-- Only allow registration if you are the user yourself AND authenticated
CREATE POLICY "Users Register Self" ON users
FOR INSERT WITH CHECK (
  auth.uid()::text = provider_id
);


COMMIT;
