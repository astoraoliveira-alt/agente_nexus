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
  console.log('Querying pg_proc for log_handoff_request...');
  const { data, error } = await supabase
    .from('pg_proc')
    .select('proname, prosrc')
    .eq('proname', 'log_handoff_request')
    .limit(1);

  if (error) {
    console.error('Error querying pg_proc:', error);
    return;
  }

  console.log('Found pg_proc entry:', data);
  if (data && data.length > 0) {
    console.log('--- FUNCTION SOURCE CODE ---');
    console.log(data[0].prosrc);
  }
}

run();
