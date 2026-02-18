
-- RUN THIS IN SUPABASE SQL EDITOR TO VERIFY SCHEMA
WITH expected_tables AS (
    SELECT unnest(ARRAY[
        'companies', 'users', 'agents', 'contacts', 'conversations', 'messages', 
        'incidents', 'evaluations', 'consumption_metrics', 'plans', 'policies',
        'flows', 'flow_stages', 'agent_flows', 'audit_logs', 'agent_audit_logs',
        'plan_audit_logs', 'agent_knowledge', 'company_davos_costs',
        'integration_logs', 'billing_alerts', 'chat_histories_memory'
    ]) AS table_name
),
found_tables AS (
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
)
SELECT 
    e.table_name,
    CASE WHEN f.table_name IS NOT NULL THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
FROM expected_tables e
LEFT JOIN found_tables f ON e.table_name = f.table_name;

-- CHECK FUNCTIONS
SELECT routine_name, '✅ EXISTS' as status
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
    'record_usage', 'get_agent_usage_stats', 'save_evaluation', 
    'get_conversation_transcript', 'audit_agent_changes', 'audit_plan_changes'
);

-- CHECK RLS POLICIES
SELECT tablename, policyname, '✅ EXISTS' as status
FROM pg_policies
WHERE schemaname = 'public';
