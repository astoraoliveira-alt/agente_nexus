const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);
const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851'; // Edenred

async function run() {
  const { data: active, error } = await supabase
    .from('conversations')
    .select('id, user_name, status, last_message_at')
    .eq('tenant_id', tenantId)
    .neq('status', 'closed')
    .lte('last_message_at', '2026-05-26T19:00:48+00:00')
    .order('last_message_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Found ${active.length} active conversations before 19:00:48:`);
  console.log(active);
}

run();
