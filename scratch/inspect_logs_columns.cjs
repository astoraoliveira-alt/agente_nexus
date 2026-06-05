const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const { data, error } = await supabase.rpc('get_db_proc_def', { name: 'fn_enqueue_inbound_message' }).maybeSingle();
  console.log('PROC:', data, error);
  
  // Let's query one row from integration_logs to see its keys
  const { data: row, error: errRow } = await supabase.from('integration_logs').select('*').limit(1);
  if (errRow) {
    console.error('Error fetching row:', errRow);
  } else {
    console.log('Columns in integration_logs:', row ? Object.keys(row[0]) : 'no rows');
  }
}

run();
