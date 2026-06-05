const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const supabaseUrl = viteUrlMatch[1].trim();

const supabase = createClient(supabaseUrl, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU');

async function run() {
  const campaignId = '0cf8ec81-352e-4e41-8468-e435f25d8a02';
  
  // check consumption tables
  const tables = ['campaign_consumption_logs', 'tenant_consumption', 'daily_consumption_logs'];
  for (const table of tables) {
    const { data: logs, error } = await supabase.from(table).select('*').eq('campaign_id', campaignId);
    if (!error) {
      console.log(`Table: ${table}`);
      console.table(logs);
    } else {
      console.log(`Error on ${table}: ${error.message}`);
    }
  }
}
run();
