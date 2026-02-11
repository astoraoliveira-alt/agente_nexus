-- =============================================
-- SECURE RPC SHIELDING (Search Path Fix)
-- Purpose: Protect functions from search_path hijacking attacks.
-- Description: Applies "SET search_path = public" to all functions in the public schema.
-- =============================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 
            quote_ident(n.nspname) || '.' || quote_ident(p.proname) || '(' || pg_get_function_identity_arguments(p.oid) || ')' as func_identity
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.prokind = 'f' -- ordinary functions
        -- Filter for our specific RPCs or those without search_path
        AND (
            p.proname IN (
                'record_usage', 'qualify_lead', 'get_detailed_consumption', 
                'get_agent_usage_stats', 'get_conversation_transcript', 
                'get_agent_context', 'save_evaluation', 'handle_knowledge_embedding', 
                'sync_vapi_call', 'append_message', 'audit_agent_changes', 
                'expire_stale_conversations', 'sync_vapi_call_debug', 
                'check_consumption_allowance', 'get_tenant_usage_summary', 
                'delete_company_cascade', 'get_or_create_conversation', 
                'get_financial_report', 'audit_plan_changes', 'close_conversation', 
                'close_idle_conversations', 'get_companies_overview', 'match_documents'
            )
            OR NOT EXISTS (
                SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg WHERE cfg LIKE 'search_path=%'
            )
        )
    ) LOOP
        EXECUTE 'ALTER FUNCTION ' || r.func_identity || ' SET search_path = public';
    END LOOP;
END $$;
