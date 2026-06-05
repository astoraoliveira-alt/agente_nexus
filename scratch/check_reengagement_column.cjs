const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const supabaseUrl = viteUrlMatch[1].trim();

const supabase = createClient(supabaseUrl, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU');

async function run() {
  const campaignId = '0cf8ec81-352e-4e41-8468-e435f25d8a02';
  
  // check outbound queue directly using correct column
  const { data: outq, error } = await supabase.from('outbound_queue').select('status, response_detected, sent_at, id, reengagement_attempt_count').eq('campaign_id', campaignId);
  if (outq) {
      console.log(`Outbound queue total for campaign: ${outq.length}`);
      
      const counts = outq.reduce((acc, curr) => {
          const val = curr.reengagement_attempt_count || 0;
          acc[val] = (acc[val] || 0) + 1;
          return acc;
      }, {});
      console.log('Reengagement Attempt Counts in Outbound Queue: ', counts);
  } else {
      console.log('Error: ', error);
  }

  // check windows
  const { data: windows, err2 } = await supabase.from('whatsapp_billing_windows').select('id, metadata').eq('metadata->>campaign_id', campaignId);
  if (windows) {
      console.log(`Whatsapp Billing Windows total: ${windows.length}`);
      const wCounts = windows.reduce((acc, curr) => {
          const val = curr.metadata.reengagement_attempt_count || 0;
          acc[val] = (acc[val] || 0) + 1;
          return acc;
      }, {});
      console.log('Reengagement Attempt Counts in Billing Windows: ', wCounts);
  }
}
run();
