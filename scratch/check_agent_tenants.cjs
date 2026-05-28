const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const { data: agents, error } = await supabase
    .from('agents')
    .select('id, name, tenant_id')
    .ilike('name', '%Fiserv%');

  if (error) {
    console.error(error);
    return;
  }

  console.log('Matching agents:');
  console.log(JSON.stringify(agents, null, 2));

  // Let's also query the company name of those tenant_ids
  const tenantIds = [...new Set(agents.map(a => a.tenant_id))];
  if (tenantIds.length > 0) {
    const { data: companies, error: err2 } = await supabase
      .from('companies')
      .select('id, name')
      .in('id', tenantIds);
    if (!err2) {
      console.log('Matching companies:');
      console.log(companies);
    }
  }
}

run();
