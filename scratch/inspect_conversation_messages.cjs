const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  console.log('Searching for conversation for BOLANHUS...');
  
  // Find conversation
  const { data: convs, error: errConv } = await supabase
    .from('conversations')
    .select('id, user_name, user_identifier, status, created_at, updated_at')
    .ilike('user_name', '%BOLANHUS%');

  if (errConv) {
    console.error(errConv);
    return;
  }

  console.log('Conversations found:', convs);
  if (!convs || convs.length === 0) {
    console.log('No conversations matching BOLANHUS.');
    return;
  }

  const convId = convs[0].id;
  console.log(`\nFetching messages for conversation ID ${convId}...`);

  // Fetch messages
  const { data: messages, error: errMsg } = await supabase
    .from('messages')
    .select('id, created_at, sender_type, direction, content, metadata, remote_id')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true });

  if (errMsg) {
    console.error(errMsg);
    return;
  }

  console.log(`Total messages in DB: ${messages.length}`);
  messages.forEach(m => {
    console.log(`\n[${m.created_at}] [${m.direction}] [${m.sender_type}] (ID: ${m.id}, Remote: ${m.remote_id})`);
    console.log(`Content: "${m.content.replace(/\n/g, '\\n')}"`);
    console.log(`Metadata:`, JSON.stringify(m.metadata));
  });
}

run();
