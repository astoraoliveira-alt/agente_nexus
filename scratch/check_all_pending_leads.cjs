const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);
const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

async function run() {
  console.log('Fetching active campaigns...');
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, status, start_date, start_time, end_time')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  console.log(`Found ${campaigns?.length || 0} active campaigns.`);

  for (const camp of campaigns || []) {
    const { data: queueData } = await supabase
      .from('outbound_queue')
      .select('status')
      .eq('campaign_id', camp.id);

    const pendingCount = queueData?.filter(r => r.status === 'pending').length || 0;
    const totalCount = queueData?.length || 0;

    console.log(`Campaign: "${camp.name}" (${camp.id})`);
    console.log(`  Start Date: ${camp.start_date} | Window: ${camp.start_time} - ${camp.end_time}`);
    console.log(`  Outbound Leads: ${totalCount} total | ${pendingCount} pending`);

    if (pendingCount > 0) {
      // Let's call get_next_leads_secure to see if it returns leads!
      const { data: leads, error } = await supabase.rpc('get_next_leads_secure', {
        p_tenant_id: tenantId,
        p_campaign_id: camp.id,
        p_limit: 5
      });
      if (error) {
        console.error(`  RPC Error for "${camp.name}":`, error.message);
      } else {
        console.log(`  get_next_leads_secure returned: ${leads?.length || 0} leads.`);
      }
    }
  }
}

run();
