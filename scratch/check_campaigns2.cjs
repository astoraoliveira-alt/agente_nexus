const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const supabaseUrl = viteUrlMatch[1].trim();

const supabase = createClient(supabaseUrl, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU');

async function run() {
  const campaignId = '0cf8ec81-352e-4e41-8468-e435f25d8a02';
  
  // check tenant consumption directly
  const { data: tCons } = await supabase.from('tenant_consumption').select('*').eq('campaign_id', campaignId);
  console.log('Tenant consumption table:');
  console.table(tCons);
  
  // check outbound queue directly
  const { data: outq } = await supabase.from('outbound_queue').select('status, response_detected, sent_at, id').eq('campaign_id', campaignId);
  if (outq) {
      console.log(`Outbound queue total for campaign: ${outq.length}`);
      const statusCounts = outq.reduce((acc, curr) => {
          acc[curr.status] = (acc[curr.status] || 0) + 1;
          return acc;
      }, {});
      console.log('Statuses: ', statusCounts);
      
      const responseCounts = outq.reduce((acc, curr) => {
          acc[curr.response_detected] = (acc[curr.response_detected] || 0) + 1;
          return acc;
      }, {});
      console.log('Response detected: ', responseCounts);
  }
}
run();
