const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);
const campaignId = 'fb8348df-5c26-42bb-a3a0-592cef3361b7'; // Carga teste 27/mai
const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

async function run() {
  console.log('Temporarily setting all campaign window fields to NULL...');
  
  // 1. Update campaign to NULL window
  const { error: errUpdate } = await supabase
    .from('campaigns')
    .update({
      start_date: '2020-01-01',
      end_date: null,
      start_time: null,
      end_time: null
    })
    .eq('id', campaignId);

  if (errUpdate) {
    console.error('Error updating campaign:', errUpdate);
    return;
  }

  console.log('Campaign window set to NULL. Calling get_next_leads_secure...');

  // 2. Call RPC
  const { data: leads, error: errRpc } = await supabase.rpc('get_next_leads_secure', {
    p_tenant_id: tenantId,
    p_campaign_id: campaignId,
    p_limit: 5
  });

  if (errRpc) {
    console.error('RPC Error:', errRpc);
  } else {
    console.log(`get_next_leads_secure returned: ${leads?.length || 0} leads.`);
    if (leads?.length > 0) {
      console.log('Returned leads:', leads.map(l => ({ id: l.id, phone: l.phone })));
    }
  }

  // 3. Restore campaign original values
  console.log('Restoring campaign to original values...');
  const { error: errRestore } = await supabase
    .from('campaigns')
    .update({
      start_date: '2026-05-27',
      end_date: null,
      start_time: '09:00',
      end_time: '18:00'
    })
    .eq('id', campaignId);

  if (errRestore) {
    console.error('Error restoring campaign:', errRestore);
  } else {
    console.log('Campaign restored successfully.');
  }
}

run();
