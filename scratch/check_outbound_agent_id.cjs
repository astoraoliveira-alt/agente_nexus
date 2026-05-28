const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);
const campaignId = 'fb8348df-5c26-42bb-a3a0-592cef3361b7'; // Carga teste 27/mai

async function run() {
  console.log('Inspecting first 5 leads in outbound_queue for campaign...');
  const { data: leads, error } = await supabase
    .from('outbound_queue')
    .select('*')
    .eq('campaign_id', campaignId)
    .limit(5);

  if (error) {
    console.error('Error fetching leads:', error);
    return;
  }

  console.log(`Found ${leads.length} leads.`);
  if (leads.length > 0) {
    leads.forEach((l, idx) => {
      console.log(`Lead ${idx + 1}:`);
      console.log(`- ID: ${l.id}`);
      console.log(`- status: ${l.status}`);
      console.log(`- contact_phone: ${l.contact_phone}`);
      console.log(`- campaign_id: ${l.campaign_id}`);
      console.log(`- agent_id: ${l.agent_id}`);
      console.log(`- tenant_id: ${l.tenant_id}`);
      console.log(`- conversation_id: ${l.conversation_id}`);
      console.log(`- metadata:`, l.metadata);
    });
  }
}

run();
