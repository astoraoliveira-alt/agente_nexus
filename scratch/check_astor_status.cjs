const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);
const phone = '5511993434870';

async function run() {
  console.log(`Checking inbound_queue for phone ${phone}...`);
  const { data: qItems, error: errQ } = await supabase
    .from('inbound_queue')
    .select('id, status, created_at, processed_at, error_message, trace_id, n8n_execution_id')
    .eq('payload->>phone', phone)
    .order('created_at', { ascending: false });

  if (errQ) {
    console.error('Error fetching queue:', errQ);
  } else {
    console.log('Queue items found:', qItems);
  }

  console.log(`\nChecking messages for conversation...`);
  const { data: messages, error: errM } = await supabase
    .from('messages')
    .select('id, created_at, sender_type, direction, content')
    .ilike('content', '%oi%')
    .order('created_at', { ascending: false })
    .limit(5);

  if (errM) {
    console.error('Error fetching messages:', errM);
  } else {
    console.log('Recent messages containing "oi":', messages);
  }
}

run();
