import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Helper to load .env.local
try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
        const envConfig = fs.readFileSync(envPath, 'utf-8');
        envConfig.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim().replace(/^['"]|['"]$/g, ''); // Remove quotes
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

// Load env vars from process (user must run with proper env or dotenv)
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: VITE_SUPABASE_URL and (SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY) are required.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Tables to export in explicit dependency order (Roots first)
const TABLES = [
    'plans',               // Independent (Reference data)
    'companies',           // Root for tenancy
    'users',               // Depends on companies
    'company_davos_costs', // Depends on companies
    'billing_alerts',      // Depends on companies
    'policies',            // Depends on companies
    'contacts',            // Depends on companies
    'agents',              // Depends on companies
    'agent_knowledge',     // Depends on agents
    'agent_audit_logs',    // Depends on agents
    'flows',               // Depends on companies
    'flow_stages',         // Depends on flows
    'agent_flows',         // Depends on agents, flows
    'conversations',       // Depends on agents, contacts
    'messages',            // Depends on conversations
    'evaluations',         // Depends on conversations
    'incidents',           // Depends on companies, agents
    'consumption_metrics', // Depends on companies, agents
    'audit_logs',          // Depends on companies, users
    'integration_logs',    // Depends on companies
    'plan_audit_logs',     // Depends on plans
    'chat_histories_memory'// Independent/External
];

// Array columns that should be formatted as PostgreSQL arrays instead of JSONB
const ARRAY_COLUMNS = new Set([
    'channels',         // agents
    'applied_policies', // agents, policies (if any)
    'tags',             // contacts, etc.
    'category_tags',    // if present
    'labels'            // if present
]);

async function generateInserts() {
    let sqlOutput = '-- Data Migration Script\n';
    sqlOutput += `-- Generated: ${new Date().toISOString()}\n`;
    sqlOutput += 'BEGIN;\n\n'; // Start transaction

    for (const table of TABLES) {
        console.log(`Processing table: ${table}...`);
        try {
            // Fetch all data
            const { data, error } = await supabase.from(table).select('*').limit(10000); // Adjust limit if needed

            if (error) {
                console.warn(`WARNING: Could not fetch data for table ${table}. Error: ${error.message}`);
                sqlOutput += `-- ERROR fetching ${table}: ${error.message}\n`;
                continue;
            }

            if (!data || data.length === 0) {
                sqlOutput += `-- Table ${table} is empty.\n\n`;
                continue;
            }

            sqlOutput += `-- Data for ${table}\n`;

            // Use the first row to determine columns and order
            const columns = Object.keys(data[0]);
            const columnsStr = columns.map(c => `"${c}"`).join(', '); // Quote identifiers

            for (const row of data) {
                const values = columns.map(col => {
                    const val = row[col];

                    if (val === null || val === undefined) return 'NULL';

                    if (typeof val === 'number') return val;

                    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';

                    if (Array.isArray(val) && ARRAY_COLUMNS.has(col)) {
                        // Handle PostgreSQL Arrays (TEXT[])
                        // Format: ARRAY['item1', 'item2']
                        if (val.length === 0) return "'{}'";
                        const items = val.map(item => `'${String(item).replace(/'/g, "''")}'`).join(', ');
                        return `ARRAY[${items}]`;
                    }

                    if (typeof val === 'object') {
                        // Handle JSON/JSONB objects
                        // Supabase client returns objects for JSON/JSONB columns
                        const jsonStr = JSON.stringify(val).replace(/'/g, "''"); // Escape single quotes
                        return `'${jsonStr}'::jsonb`;
                    }

                    // Handle Strings, Dates, UUIDs (all strings in JSON)
                    // Escape single quotes by doubling them
                    return `'${String(val).replace(/'/g, "''")}'`;
                }).join(', ');

                sqlOutput += `INSERT INTO public.${table} (${columnsStr}) VALUES (${values}) ON CONFLICT DO NOTHING;\n`;
            }
            sqlOutput += '\n';

        } catch (err) {
            console.error(`Unexpected error processing ${table}:`, err);
            sqlOutput += `-- Unexpected error processing ${table}: ${err}\n`;
        }
    }

    sqlOutput += 'COMMIT;\n'; // Commit transaction
    fs.writeFileSync(path.join(process.cwd(), 'database', 'data_dump.sql'), sqlOutput);
    console.log('Done! Script saved to database/data_dump.sql');
}

generateInserts();
