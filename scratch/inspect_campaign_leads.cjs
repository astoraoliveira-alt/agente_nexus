const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);
const campaignId = 'fb8348df-5c26-42bb-a3a0-592cef3361b7'; // Carga teste 27/mai
const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

async function run() {
  console.log('Inspecting campaign and outbound leads details...');
  
  // 1. Fetch campaign
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, name, status, start_date, start_time, end_time, tenant_id')
    .eq('id', campaignId)
    .single();

  console.log('Campaign:', campaign);

  // 2. Fetch a few leads from outbound_queue
  const { data: leads } = await supabase
    .from('outbound_queue')
    .select('id, tenant_id, campaign_id, status, contact_phone, created_at')
    .eq('campaign_id', campaignId)
    .limit(3);

  console.log('Sample leads from outbound_queue:', leads);

  // 3. Check if there are any pressure logs blocking
  const phones = leads.map(l => l.contact_phone);
  if (phones.length > 0) {
    const { data: pressureLogs } = await supabase
      .from('contact_pressure_logs')
      .select('*')
      .in('contact_phone', phones);
    console.log('Pressure logs for sample phones:', pressureLogs);
  }
}

run();
