const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n');
let url = '', key = '';
env.forEach(line => {
  const t = line.trim();
  if (t.startsWith('VITE_SUPABASE_URL=')) url = t.split('=')[1];
  if (t.startsWith('VITE_SUPABASE_ANON_KEY=')) key = t.split('=')[1];
});

const supabase = createClient(url, key);
const sql = fs.readFileSync('fix_final_vapi_sync_v23.sql', 'utf8');

async function run() {
  console.log("Applying SQL via direct call...");
  const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });
  if (error) {
    // If exec_sql doesn't exist, we might have to tell the user to run it
    console.log("RPC exec_sql error:", error.message);
  } else {
    console.log("Success");
  }
}
run();
