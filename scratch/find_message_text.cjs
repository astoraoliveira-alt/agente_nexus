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
  console.log('🔍 Searching messages for "portalestabelecimento"...');
  
  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, content, sender_type, created_at, conversation_id')
    .ilike('content', '%portalestabelecimento%')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${messages.length} messages:`);
  for (const msg of messages) {
    // Fetch conversation details
    const { data: conv } = await supabase
      .from('conversations')
      .select('user_name, user_identifier')
      .eq('id', msg.conversation_id)
      .single();
      
    console.log(`Msg ID: ${msg.id} | Date: ${msg.created_at} | Conv ID: ${msg.conversation_id} | Name: ${conv?.user_name} | Phone: ${conv?.user_identifier}`);
    console.log(`Content: ${msg.content.substring(0, 100)}...`);
    console.log('---');
  }

  // Also search for the re-engagement text specifically
  console.log('🔍 Searching messages for re-engagement CTA...');
  const { data: ctaMessages } = await supabase
    .from('messages')
    .select('id, content, sender_type, created_at, conversation_id')
    .eq('content', '*Você ainda tem alguma dúvida ou posso te ajudar com algo mais?*')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log(`Found ${ctaMessages?.length || 0} CTA messages:`);
  for (const msg of ctaMessages || []) {
    const { data: conv } = await supabase
      .from('conversations')
      .select('user_name, user_identifier')
      .eq('id', msg.conversation_id)
      .single();
    console.log(`Msg ID: ${msg.id} | Date: ${msg.created_at} | Name: ${conv?.user_name} | Phone: ${conv?.user_identifier}`);
  }
}

run();
