const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', 'porteiro', '.env');
const envData = fs.readFileSync(envPath, 'utf8');
let url = '', key = '';
envData.split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k?.trim() === 'SUPABASE_URL') url = v.trim();
    if (k?.trim() === 'SUPABASE_SERVICE_ROLE_KEY') key = v.trim();
});

const supabase = createClient(url, key);

async function run() {
  const sqlFile = path.join(__dirname, '..', 'database', 'migrations', '20260804_fiserv_funnel_and_handoff.sql');
  console.log(`Applying ${sqlFile}...`);
  const sql = fs.readFileSync(sqlFile, 'utf8');
  
  // Try available exec RPCs
  let res = await supabase.rpc('exec_sql', { sql_string: sql });
  if (res.error) {
    console.log('exec_sql failed, trying execute_sql...', res.error.message);
    res = await supabase.rpc('execute_sql', { query: sql });
  }
  if (res.error) {
    console.log('execute_sql failed, trying exec_sql with query parameter...', res.error.message);
    res = await supabase.rpc('exec_sql', { query: sql });
  }
  if (res.error) {
    console.log('Trying fn_execute_sql...', res.error.message);
    res = await supabase.rpc('fn_execute_sql', { sql_query: sql });
  }

  if (res.error) {
    console.error('❌ Failed to execute migration via RPC:', res.error);
  } else {
    console.log('✅ Migration applied successfully!', res.data);
  }
}

run();
