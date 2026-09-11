const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const tables = [
    'agents', 'agent_knowledge_base', 'knowledge_base', 'faq', 'agent_faqs', 'faqs',
    'templates', 'whatsapp_templates', 'zenvia_templates', 'agent_prompts',
    'system_prompts', 'company_davos_costs', 'campaigns'
  ];

  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(100);
    if (data && data.length > 0) {
      for (const row of data) {
        const str = JSON.stringify(row);
        if (str.includes('LINK_TERMO_FISERV') || str.includes('autoriza a Fiserv')) {
          console.log(`🎯 FOUND in table '${t}', ID: ${row.id}`);
          console.log(str);
        }
      }
    }
  }
}

run();
