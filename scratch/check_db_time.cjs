const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  console.log('Querying latest system_logs to check DB timestamp...');
  
  const { data: logs, error: errFetch } = await supabase
    .from('system_logs')
    .select('id, created_at, message')
    .order('created_at', { ascending: false })
    .limit(5);

  if (errFetch) {
    console.error('Error fetching logs:', errFetch);
    return;
  }

  console.log('Latest logs:');
  logs.forEach(log => {
    console.log(`- Message: "${log.message}" | created_at: ${log.created_at} | Local parsed: ${new Date(log.created_at).toString()}`);
  });
}

run();
