const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  console.log('Inspecting all integration_logs around 15:00-15:25 UTC...');
  
  const { data: intLogs, error: errInt } = await supabase
    .from('integration_logs')
    .select('*')
    .gte('processed_at', '2026-05-27T15:00:00.000Z')
    .lte('processed_at', '2026-05-27T15:25:00.000Z')
    .order('processed_at', { ascending: true });

  if (errInt) {
    console.error(errInt);
  } else {
    console.log(`Found ${intLogs?.length || 0} integration logs.`);
    intLogs?.forEach(l => {
      console.log(`[${l.processed_at}] [${l.status}] Provider: ${l.provider} | Path: ${l.path}`);
      console.log(`  Phone: ${l.phone_number} | External ID: ${l.external_id} | Trace ID: ${l.trace_id}`);
      console.log(`  Validation:`, JSON.stringify(l.validation_results));
      if (l.error_details) console.log(`  Error: ${l.error_details}`);
    });
  }
}

run();
