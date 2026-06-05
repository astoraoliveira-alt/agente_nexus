const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const { data: agent, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', '0e5a2927-1617-48a7-9e54-0834ddbbc924')
    .single();

  if (error) {
    console.error(error);
    return;
  }

  console.log('=== FULL AGENT ===');
  Object.keys(agent).forEach(k => {
    console.log(`\n--- Key: ${k} ---`);
    console.log(typeof agent[k] === 'object' ? JSON.stringify(agent[k], null, 2) : agent[k]);
  });
}

run();
