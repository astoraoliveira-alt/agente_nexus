const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

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

const supabase = createClient(supabaseUrl.trim(), supabaseKey.trim());

async function run() {
  console.log('Testing fn_execute_sql with porteiro/.env key...');
  
  const { data, error } = await supabase.rpc('fn_execute_sql', {
    sql_query: `
      SELECT 
        NOW() as db_now,
        CURRENT_DATE as db_current_date,
        CURRENT_TIME as db_current_time,
        (CURRENT_TIME AT TIME ZONE 'America/Sao_Paulo')::time as sp_time
    `
  });

  if (error) {
    console.error('RPC Error:', error);
  } else {
    console.log('Result:', data);
  }
}

run();
