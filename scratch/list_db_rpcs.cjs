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
  const { data, error } = await supabase
    .from('pg_proc')
    .select('proname')
    .ilike('proname', '%exec%');
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Functions containing exec:', data.map(f => f.proname));
}

run();
