const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const { data: messages } = await supabase
    .from('messages')
    .select('created_at, metadata')
    .eq('tenant_id', 'd290f1ee-6c54-4b01-90e6-d701748f0851')
    .contains('metadata', { campaign_id: 'f1f5cbb0-389c-471f-8f5e-069e31d9888b' })
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('Recent messages for Disparo 01.06:');
  console.log(messages);
}
run();
