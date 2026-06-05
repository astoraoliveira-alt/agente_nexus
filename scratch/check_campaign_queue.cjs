const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);
const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

async function run() {
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('id, name, sent_count')
    .ilike('name', '%Disparo 01.06%')
    .eq('tenant_id', tenantId)
    .single();

  if (error || !campaign) {
    console.log('Campaign not found or error:', error);
    return;
  }
  console.log('Campaign:', campaign);

  const { data: queueData, error: qError } = await supabase
    .from('outbound_queue')
    .select('status, response_detected')
    .eq('campaign_id', campaign.id);

  if (qError) {
      console.log('Queue error:', qError);
      return;
  }

  const statusCounts = {};
  const responseCounts = { true: 0, false: 0, null: 0 };
  
  for (const item of queueData) {
     statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
     const rd = item.response_detected === null ? 'null' : item.response_detected;
     responseCounts[rd] = (responseCounts[rd] || 0) + 1;
  }
  console.log('Status breakdown:', statusCounts);
  console.log('Response detected breakdown:', responseCounts);
}
run();
