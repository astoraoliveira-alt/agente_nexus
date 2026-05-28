const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  console.log('Fetching active definition of get_next_leads_secure from pg_proc...');
  
  // We can query pg_proc and pg_get_functiondef
  // But wait! Is pg_get_functiondef available via postgrest?
  // Usually, pg_proc is not exposed to the public API unless we query it.
  // Let's see if we can query pg_proc.
  const { data, error } = await supabase
    .from('pg_proc')
    .select('prosrc')
    .ilike('proname', 'get_next_leads_secure')
    .limit(1);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Result length:', data?.length);
  if (data?.length > 0) {
    console.log('Function Definition:');
    console.log(data[0].prosrc);
  } else {
    console.log('Could not find definition.');
  }
}

run();
