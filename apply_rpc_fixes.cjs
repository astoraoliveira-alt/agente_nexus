const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, 'porteiro', '.env');
const envData = fs.readFileSync(envPath, 'utf8');
let url = '', key = '';
envData.split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k?.trim() === 'SUPABASE_URL') url = v.trim();
    if (k?.trim() === 'SUPABASE_SERVICE_ROLE_KEY') key = v.trim();
});

const supabase = createClient(url, key);

async function run() {
  const files = ['database/rpc/get_all_campaigns_metrics_v2.sql', 'database/rpc/get_campaign_leads_enriched.sql'];
  for (const file of files) {
    console.log(`Applying ${file}...`);
    const sql = fs.readFileSync(file, 'utf8');
    const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });
    if (error) {
      console.log(`RPC exec_sql error for ${file}:`, error.message);
      // fallback
      const { data: d2, error: e2 } = await supabase.rpc('execute_sql', { query: sql });
      if (e2) {
         console.log(`Fallback execute_sql error:`, e2.message);
      } else {
         console.log(`Success fallback for ${file}`);
      }
    } else {
      console.log(`Success for ${file}`);
    }
  }
}
run();
