const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  console.log('Searching for messages in Supabase containing "Um agente entrará em contato"...');
  
  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, conversation_id, content, sender_type, direction, metadata, created_at')
    .ilike('content', '%Um agente entrará em contato%')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Total matching messages: ${messages.length}`);
  messages.forEach(m => {
    console.log(`\n[${m.created_at}] ID: ${m.id} | ConvId: ${m.conversation_id} | Sender: ${m.sender_type} | Direction: ${m.direction}`);
    console.log(`Content: "${m.content}"`);
    console.log(`Metadata:`, JSON.stringify(m.metadata));
  });
}

run();
