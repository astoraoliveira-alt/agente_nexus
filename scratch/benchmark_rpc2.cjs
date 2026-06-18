const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(viteUrlMatch[1].trim(), serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
const campaignId = 'bf607c72-4e7e-4222-a208-feb888ae3615';

async function testPerformance() {
  console.log('Testing RPC Performance...');
  const start = Date.now();
  
  const { data, error } = await supabase.rpc('get_next_leads_secure', {
    p_tenant_id: tenantId,
    p_campaign_id: campaignId,
    p_limit: 200
  });
  
  const end = Date.now();
  
  if (error) {
    console.error('RPC Error:', error);
  } else {
    console.log(`RPC returned ${data ? data.length : 0} rows in ${end - start} ms`);
    if (data && data.length > 0) {
      console.log('Sample row id:', data[0].id);
    }
  }
}

testPerformance();
