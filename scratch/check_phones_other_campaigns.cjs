const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);
const campaignId = 'fb8348df-5c26-42bb-a3a0-592cef3361b7'; // Carga teste 27/mai
const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

async function run() {
  console.log('Fetching all phone numbers for the target campaign...');
  const { data: leads, error } = await supabase
    .from('outbound_queue')
    .select('contact_phone')
    .eq('campaign_id', campaignId);

  if (error) {
    console.error(error);
    return;
  }

  const phones = leads.map(l => l.contact_phone);
  console.log(`Found ${phones.length} phones. Checking if any of them exist in other campaigns...`);

  // Check if they exist in other campaigns with status = 'sent' or 'processing'
  // We can search in batches of 100
  let matched = [];
  const batchSize = 100;
  for (let i = 0; i < phones.length; i += batchSize) {
    const batch = phones.slice(i, i + batchSize);
    const { data, error: err2 } = await supabase
      .from('outbound_queue')
      .select('id, campaign_id, contact_phone, status')
      .neq('campaign_id', campaignId)
      .in('contact_phone', batch);

    if (err2) {
      console.error(err2);
      return;
    }
    if (data && data.length > 0) {
      matched = matched.concat(data);
    }
  }

  console.log(`Total matches in other campaigns: ${matched.length}`);
  if (matched.length > 0) {
    console.log('Sample matched rows:', matched.slice(0, 10));
  }
}

run();
