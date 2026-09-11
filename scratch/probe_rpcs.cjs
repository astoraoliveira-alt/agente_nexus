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

async function probe() {
  const rpcs = [
    'test_ping', 'test_proc', 'exec_readonly_sql', 'get_schema_tables',
    'get_schema_view_config', 'get_schema_all_tables', 'get_database_schema_v1',
    'run_sql', 'sql_exec', 'admin_exec'
  ];
  for (const rpc of rpcs) {
    const res = await supabase.rpc(rpc);
    if (res.error && res.error.code === 'PGRST202') {
      // not found
    } else {
      console.log(`Found RPC: ${rpc} ->`, res.data || res.error);
    }
  }
}

probe();
