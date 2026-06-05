const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const supabaseUrl = viteUrlMatch[1].trim();

const supabase = createClient(supabaseUrl, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU');

async function run() {
  const campaignId = '0cf8ec81-352e-4e41-8468-e435f25d8a02';
  
  const { data: outq } = await supabase.from('outbound_queue').select('sent_at, reengagement_attempt_count').eq('campaign_id', campaignId);
  if (outq) {
      const initial = outq.filter(o => o.reengagement_attempt_count === 0 && o.sent_at);
      const reeng = outq.filter(o => o.reengagement_attempt_count === 1 && o.sent_at);
      
      if (initial.length > 0 && reeng.length > 0) {
          const firstInitial = new Date(Math.min(...initial.map(i => new Date(i.sent_at))));
          const lastInitial = new Date(Math.max(...initial.map(i => new Date(i.sent_at))));
          const firstReeng = new Date(Math.min(...reeng.map(i => new Date(i.sent_at))));
          const lastReeng = new Date(Math.max(...reeng.map(i => new Date(i.sent_at))));
          
          console.log(`Initial msgs sent between: ${firstInitial.toISOString()} and ${lastInitial.toISOString()}`);
          console.log(`Reeng msgs sent between: ${firstReeng.toISOString()} and ${lastReeng.toISOString()}`);
      }
  }
}
run();
