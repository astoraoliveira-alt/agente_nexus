const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  console.log('Querying agent_leads structure...');
  const { data: leads, error } = await supabase
    .from('agent_leads')
    .select('*')
    .limit(5);

  if (error) {
    console.error(error);
    return;
  }

  console.log('Sample leads count:', leads.length);
  if (leads.length > 0) {
    console.log('Columns in agent_leads:', Object.keys(leads[0] || {}));
    console.log('Sample data:', leads[0]);
  } else {
    console.log('No agent_leads found.');
  }

  // Check if we can find campaigns
  const { data: campaigns, error: errC } = await supabase
    .from('campaigns')
    .select('id, name')
    .limit(5);
  console.log('Campaigns:', campaigns);
}

run();
