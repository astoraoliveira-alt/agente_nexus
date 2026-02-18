import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load .env.local
try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
        const envConfig = fs.readFileSync(envPath, 'utf-8');
        envConfig.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim().replace(/^['"]|['"]$/g, '');
                if (!process.env[key]) {
                    process.env[key] = value;
                }
            }
        });
        console.log('Loaded .env.local');
    }
} catch (e) {
    console.warn('Could not load .env.local', e);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON) required.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runAudit() {
    console.log('Auditing database schema...');
    const report: any = {
        generated_at: new Date().toISOString(),
        tables: {},
        functions: [],
        policies: []
    };

    // 1. Tables & Columns
    const { data: tables, error: tableError } = await supabase.rpc('audit_get_tables_columns');
    // Note: We need a way to query system catalog. 
    // Since we might not have direct SQL access, we try to use postgrest on information_schema if enabled,
    // OR we try to fetch via a known RPC if available.

    // Actually, standard PostgREST doesn't expose information_schema by default.
    // We will try to rely on the fact that the user can execute SQL in the dashboard.
    // BUT, to make this script work from the client, we need a way to inspect schema.

    // PLAN B: Construct a "schema_dump.json" by inferring from what we can see? No, that's weak.
    // The user asked for a TEST to see if everything is there.

    console.log('Fetching public tables (via Supabase API inference)...');

    // We will list the known tables from our previous analysis
    const knownTables = [
        'companies', 'users', 'agents', 'contacts', 'conversations', 'messages',
        'incidents', 'evaluations', 'consumption_metrics', 'plans', 'policies',
        'flows', 'flow_stages', 'agent_flows', 'audit_logs', 'agent_audit_logs',
        'plan_audit_logs', 'agent_knowledge', 'company_davos_costs'
    ];

    for (const tableName of knownTables) {
        // Check if table exists and get a sample to infer columns (imperfect but works for existence check)
        // Better: Try to select 0 rows to check existence and maybe get shape?
        try {
            const { data, error } = await supabase.from(tableName).select('*').limit(1);

            if (error) {
                report.tables[tableName] = { status: 'MISSING_OR_ERROR', error: error.message };
            } else {
                report.tables[tableName] = { status: 'EXISTS', columns_detected: data && data.length > 0 ? Object.keys(data[0]) : 'Unknown (Empty Table)' };
            }
        } catch (err) {
            report.tables[tableName] = { status: 'ERROR', detail: err };
        }
    }

    // 2. RPCs (Functions)
    // We can't easily list RPCs via client unless we try to call them or have system access.
    // However, we can list the ones we expect and try to call them (if safe) or just skip.
    // Since we generated the schema, we know what SHOULD be there.

    // If the user has access to the SQL Editor, the best verification is running a SQL query.
    // Let's generate a SQL Verification Script instead of a weak TS script, 
    // because the TS script is limited by PostgREST permissions/visibility.

    console.log('\nNOTE: Client-side audit is limited. Generating a SQL Audit Script for you to run in Dashboard.\n');

    const sqlAuditScript = `
-- RUN THIS IN SUPABASE SQL EDITOR TO VERIFY SCHEMA
WITH expected_tables AS (
    SELECT unnest(ARRAY[
        'companies', 'users', 'agents', 'contacts', 'conversations', 'messages', 
        'incidents', 'evaluations', 'consumption_metrics', 'plans', 'policies',
        'flows', 'flow_stages', 'agent_flows', 'audit_logs', 'agent_audit_logs',
        'plan_audit_logs', 'agent_knowledge', 'company_davos_costs'
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
`;

    fs.writeFileSync('database/verify_schema.sql', sqlAuditScript);
    console.log('Created database/verify_schema.sql - Run this in your Supabase SQL Editor.');

    // Save the JSON report for what we COULD find
    fs.writeFileSync('database/client_audit_report.json', JSON.stringify(report, null, 2));
    console.log('Saved database/client_audit_report.json (Client-side visibility check).');
}

runAudit();
