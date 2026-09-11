const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const { data } = await supabase.from('outbound_queue').select('*').eq('trace_id', 'ZNV-GV5BE7');
  console.log('--- OUTBOUND QUEUE ITEM ZNV-GV5BE7 ---');
  console.log(JSON.stringify(data, null, 2));

  const { data: q2 } = await supabase.from('outbound_queue').select('*').order('created_at', { ascending: false }).limit(5);
  console.log('--- LAST 5 OUTBOUND QUEUE ITEMS ---');
  console.log(JSON.stringify(q2, null, 2));
}

run();
