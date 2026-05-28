const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 1. Carrega credenciais do Porteiro
const envPath = path.join(__dirname, '../porteiro', '.env');
if (!fs.existsSync(envPath)) {
    console.error('❌ Erro: Arquivo porteiro/.env não encontrado.');
    process.exit(1);
}

const envData = fs.readFileSync(envPath, 'utf8');
let url = '', key = '';

envData.split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k === 'SUPABASE_URL') url = v.trim();
    if (k === 'SUPABASE_SERVICE_ROLE_KEY') key = v.trim();
});

const supabase = createClient(url, key);

async function run() {
  console.log('🔍 Querying messages for Astor...');
  
  // Find conversation
  const { data: convs } = await supabase
    .from('conversations')
    .select('id, user_name, user_identifier')
    .eq('user_identifier', '5516991622771');
    
  if (!convs || convs.length === 0) {
    console.log('❌ Conversation not found');
    return;
  }
  
  const convId = convs[0].id;
  console.log(`Found conversation ID: ${convId} for user ${convs[0].user_name}`);

  // Fetch messages from today
  const { data: messages } = await supabase
    .from('messages')
    .select('id, content, sender_type, created_at, trace_id, external_id')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('Last 10 messages:');
  console.log(JSON.stringify(messages, null, 2));

  // Fetch outbound queue for this conversation
  const { data: queue } = await supabase
    .from('outbound_queue')
    .select('id, status, error_message, scheduled_at, sent_at, created_at, metadata')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('Last 5 outbound queue items:');
  console.log(JSON.stringify(queue, null, 2));
}

run();
