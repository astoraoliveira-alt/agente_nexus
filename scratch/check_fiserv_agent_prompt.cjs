const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const { data } = await supabase
    .from('agents')
    .select('id, name, brain_config, workflow_blueprint, integration_config')
    .eq('id', '007b8c68-5601-410c-b88a-db7e3317e9ec');
    
  if (data && data.length > 0) {
    const a = data[0];
    console.log('--- SYSTEM PROMPT ---');
    console.log(a.brain_config?.systemPrompt || 'None');
    console.log('\n--- WORKFLOW BLUEPRINT ---');
    console.log(JSON.stringify(a.workflow_blueprint, null, 2));
    console.log('\n--- INTEGRATION CONFIG ---');
    console.log(JSON.stringify(a.integration_config, null, 2));
  } else {
    console.log('Agent not found');
  }
}

run();
