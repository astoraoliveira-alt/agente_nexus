const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);
const phone = '5511968331074';

async function run() {
  console.log(`Inspecting all outbound_queue items for phone ${phone}...`);
  const { data: oq, error } = await supabase
    .from('outbound_queue')
    .select('id, created_at, status, response_detected, campaign_id, campaign:campaigns(name, reengagement_enabled), sent_at, metadata')
    .eq('contact_phone', phone);

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Found ${oq.length} queue records.`);
  oq.forEach((l, idx) => {
    console.log(`\nRecord ${idx + 1}:`);
    console.log(`- ID: ${l.id}`);
    console.log(`- Campaign: "${l.campaign?.name}" (ID: ${l.campaign_id}, Re-engagement: ${l.campaign?.reengagement_enabled})`);
    console.log(`- status: ${l.status}`);
    console.log(`- response_detected: ${l.response_detected}`);
    console.log(`- created_at: ${l.created_at}`);
    console.log(`- sent_at: ${l.sent_at}`);
    console.log(`- metadata:`, JSON.stringify(l.metadata));
  });
}

run();
