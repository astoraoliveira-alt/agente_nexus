const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(viteUrlMatch[1].trim(), serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const campaignId = 'bf607c72-4e7e-4222-a208-feb888ae3615';

async function check() {
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();
    
  console.log('--- Campaign ---');
  if (campErr) console.error(campErr);
  else console.log(campaign);
  
  const { data: queue, error: queueErr } = await supabase
    .from('outbound_queue')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .limit(3);
    
  console.log('\n--- Sample Pending Queue Items ---');
  if (queueErr) console.error(queueErr);
  else console.log(queue);
}

check();
