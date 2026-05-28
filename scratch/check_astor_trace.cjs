const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  console.log(`Checking inbound_queue for trace ZNV-K2MYR...`);
  const { data: qItems, error: errQ } = await supabase
    .from('inbound_queue')
    .select('*')
    .eq('trace_id', 'ZNV-K2MYR');

  if (errQ) {
    console.error('Error fetching queue:', errQ);
  } else {
    console.log('Queue item:', qItems);
  }
  
  if (qItems && qItems.length > 0) {
    const convId = qItems[0].conversation_id;
    console.log(`\nChecking messages for conversation_id ${convId}...`);
    const { data: messages, error: errM } = await supabase
      .from('messages')
      .select('id, created_at, sender_type, direction, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (errM) {
      console.error('Error fetching messages:', errM);
    } else {
      console.log('Recent messages:', messages);
    }
  }
}

run();
