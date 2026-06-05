const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const { data: queueData, error: qError } = await supabase
    .from('outbound_queue')
    .select('sent_at, metadata')
    .eq('campaign_id', 'f1f5cbb0-389c-471f-8f5e-069e31d9888b')
    .not('sent_at', 'is', null)
    .limit(10);

  if (qError) {
      console.log('Queue error:', qError);
      return;
  }

  console.log('Sample dates:');
  for (const item of queueData) {
     console.log('sent_at:', item.sent_at, 'read_at:', item.metadata?.read_at);
  }
}
run();
