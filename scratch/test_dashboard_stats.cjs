const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);
const campaignId = 'fb8348df-5c26-42bb-a3a0-592cef3361b7'; // Carga teste 27/mai
const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

async function run() {
  console.log('Calling get_campaign_dashboard_stats...');
  const { data, error } = await supabase.rpc('get_campaign_dashboard_stats', {
    p_campaign_id: campaignId,
    p_tenant_id: tenantId
  });

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Stats Result:', data);
  }
}

run();
