const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);
const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

// Campaign IDs:
// 1. '04aa659f-db7a-4aab-8cb0-2ae78cb8d582' - Carga teste 26/mai (active and has processed leads)
// 2. 'fb8348df-5c26-42bb-a3a0-592cef3361b7' - Carga teste 27/mai (active and 1000 pending)

async function testCampaign(campaignId, name) {
  console.log(`\nTesting RPC get_next_leads_secure for campaign "${name}" (${campaignId})...`);
  const { data, error } = await supabase.rpc('get_next_leads_secure', {
    p_tenant_id: tenantId,
    p_campaign_id: campaignId,
    p_limit: 2
  });

  if (error) {
    console.error('RPC Error:', error);
  } else {
    console.log(`Result length: ${data?.length || 0}`);
    if (data?.length > 0) {
      console.log('Sample data keys:', Object.keys(data[0]));
      console.log('Sample data:', data.map(d => ({ id: d.id, phone: d.phone, template_id: d.template_id })));
    }
  }
}

async function run() {
  await testCampaign('04aa659f-db7a-4aab-8cb0-2ae78cb8d582', 'Carga teste 26/mai');
  await testCampaign('fb8348df-5c26-42bb-a3a0-592cef3361b7', 'Carga teste 27/mai');
}

run();
