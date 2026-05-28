const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../porteiro', '.env');
const envData = fs.readFileSync(envPath, 'utf8');
let url = '', key = '';

envData.split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k === 'SUPABASE_URL') url = v.trim();
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') key = v.trim();
});

const supabase = createClient(url, key);

async function run() {
  const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
  
  const { count, error } = await supabase
      .from('outbound_queue')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

  if (error) {
      console.error(error);
      return;
  }

  console.log(`Total rows in outbound_queue for this tenant: ${count}`);
}

run();
