const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync('porteiro/.env', 'utf8');
const lines = envFile.split('\n');
const env = {};
for (const line of lines) {
  if (line && line.includes('=')) {
    const [key, ...rest] = line.split('=');
    env[key] = rest.join('=');
  }
}

const supabaseUrl = env['SUPABASE_URL'] || env['VITE_SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing credentials in porteiro/.env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl.trim(), supabaseKey.trim());

async function run() {
    const sqlPath = path.join(__dirname, '../database/migrations/20260526_aggregate_consumption_by_hour.sql');
    console.log(`🚀 Loading SQL from: ${sqlPath}`);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Sending SQL to fn_execute_sql RPC...');
    const { data, error } = await supabase.rpc('fn_execute_sql', { sql_query: sql });
    
    if (error) {
        console.error('❌ SQL execution error:', error);
        return;
    }
    
    console.log('✅ SQL executed successfully via RPC!');
}

run();
