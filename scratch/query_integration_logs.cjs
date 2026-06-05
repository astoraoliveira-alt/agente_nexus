const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  console.log('Searching for integration_logs for conversation 098f0415-da15-4f1c-b617-8811cb4897d0...');
  
  const { data: logs, error } = await supabase
    .from('integration_logs')
    .select('*')
    .eq('conversation_id', '098f0415-da15-4f1c-b617-8811cb4897d0')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Logs found: ${logs.length}`);
  logs.forEach(l => {
    console.log(`\n[${l.created_at}] ID: ${l.id} | Status: ${l.status_code}`);
    console.log(`Request:`, JSON.stringify(l.request_payload));
    console.log(`Response:`, JSON.stringify(l.response_payload));
  });
}

run();
