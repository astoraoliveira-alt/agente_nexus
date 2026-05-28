const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);
const campaignId = 'fb8348df-5c26-42bb-a3a0-592cef3361b7'; // Carga teste 27/mai

async function run() {
  console.log('Checking for any non-null conversation_id in the campaign queue...');
  const { data, error } = await supabase
    .from('outbound_queue')
    .select('id')
    .eq('campaign_id', campaignId)
    .not('conversation_id', 'is', null);

  if (error) {
    console.error(error);
  } else {
    console.log('Leads with non-null conversation_id:', data.length);
  }
}

run();
