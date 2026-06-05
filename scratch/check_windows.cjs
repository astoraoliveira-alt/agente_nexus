const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const supabaseUrl = viteUrlMatch[1].trim();

const supabase = createClient(supabaseUrl, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU');

async function run() {
  const campaignId = '0cf8ec81-352e-4e41-8468-e435f25d8a02';
  
  const { data: windows, error } = await supabase.from('whatsapp_billing_windows').select('*').eq('metadata->>campaign_id', campaignId);
  if (windows) {
      console.log(`Total Windows: ${windows.length}`);
      
      const newWindows = windows.filter(w => w.metadata && w.metadata.reengagement_attempt_count === 1);
      console.log(`New Windows for re-eng (count=1): ${newWindows.length}`);
      
      if (newWindows.length > 0) {
          console.log('Sample of new window:', JSON.stringify(newWindows[0], null, 2));
      }
      
      const oldWindows = windows.filter(w => !w.metadata || w.metadata.reengagement_attempt_count === 0);
      if (oldWindows.length > 0) {
          console.log('Sample of old window:', JSON.stringify(oldWindows[0], null, 2));
      }
      
      const firstOld = new Date(Math.min(...oldWindows.map(i => new Date(i.window_started_at))));
      const lastOld = new Date(Math.max(...oldWindows.map(i => new Date(i.window_started_at))));
      const lastExpOld = new Date(Math.max(...oldWindows.map(i => new Date(i.window_expires_at))));
      
      console.log(`Old windows started between: ${firstOld.toISOString()} and ${lastOld.toISOString()}`);
      console.log(`Old windows expired max at: ${lastExpOld.toISOString()}`);
  }
}
run();
