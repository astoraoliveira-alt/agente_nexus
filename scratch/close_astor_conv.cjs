const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const phone = '5511993434871';
  console.log('Checking open conversations for:', phone);
  
  const { data: convs, error } = await supabase
    .from('conversations')
    .select('id, status, updated_at')
    .eq('user_identifier', phone)
    .neq('status', 'closed');
    
  if (convs && convs.length > 0) {
    console.log(`Closing ${convs.length} active conversation(s)...`);
    for (const c of convs) {
      await supabase.from('conversations').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', c.id);
      console.log(`Closed conv: ${c.id}`);
    }
  } else {
    console.log('No active conversations to close.');
  }
}

run();
