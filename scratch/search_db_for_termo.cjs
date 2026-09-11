const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  console.log('Searching all agents for LINK_TERMO_FISERV or SIM, AUTORIZO...');
  const { data: agents } = await supabase.from('agents').select('*');
  for (const a of (agents || [])) {
    const str = JSON.stringify(a);
    if (str.includes('LINK_TERMO_FISERV') || str.includes('AUTORIZO')) {
      console.log(`🎯 FOUND in agent ${a.name} (${a.id}):`);
      if (a.brain_config?.systemPrompt?.includes('LINK_TERMO_FISERV') || a.brain_config?.systemPrompt?.includes('AUTORIZO')) {
        console.log('  -> In brain_config.systemPrompt');
      }
      if (JSON.stringify(a.workflow_blueprint).includes('LINK_TERMO_FISERV') || JSON.stringify(a.workflow_blueprint).includes('AUTORIZO')) {
        console.log('  -> In workflow_blueprint');
      }
    }
  }

  // Also check if there's any template table
  const tables = ['templates', 'whatsapp_templates', 'zenvia_templates', 'campaign_templates'];
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(5);
    if (data && data.length > 0) {
      console.log(`Table ${t} exists and has ${data.length} rows.`);
    }
  }
}

run();
