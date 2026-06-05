const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const { data: qData } = await supabase.rpc('get_detailed_consumption', {
      p_tenant_id: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
      p_days: 30
  });

  const campaignRows = qData.filter(r => r.campaign_id === 'f1f5cbb0-389c-471f-8f5e-069e31d9888b' && r.metric_type === 'messages');
  
  console.log('Campaign messages from get_detailed_consumption:');
  console.table(campaignRows.map(r => ({ recorded_at: r.recorded_at, value: r.value, reeng: r.reengagement_attempt })));
}
run();
