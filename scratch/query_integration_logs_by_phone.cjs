const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  console.log('Searching for integration_logs for phone/identifier 5534996396409...');
  
  const { data: logs, error } = await supabase
    .from('integration_logs')
    .select('*')
    .or('phone_number.eq.5534996396409,phone_number.eq.34996396409,phone_number.eq.5534996396409@c.us,phone_number.eq.34996396409@c.us')
    .order('processed_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Logs found by phone: ${logs.length}`);
  logs.forEach(l => {
    console.log(`\n[${l.processed_at}] ID: ${l.id} | Status: ${l.status} | Provider: ${l.provider}`);
    console.log(`Payload preview:`, JSON.stringify(l.payload).slice(0, 500));
  });
}

run();
