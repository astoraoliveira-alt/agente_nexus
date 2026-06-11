const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function loadEnv() {
    const paths = [
        path.join(__dirname, '../.env.local'),
        path.join(__dirname, '../porteiro/.env'),
        path.join(__dirname, '../.env')
    ];
    
    let loaded = false;
    for (const p of paths) {
        if (fs.existsSync(p)) {
            console.log(`Loading env from: ${p}`);
            const content = fs.readFileSync(p, 'utf8');
            content.split('\n').forEach(line => {
                const parts = line.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join('=').trim().replace(/['"]+/g, '');
                    process.env[key] = value;
                }
            });
            loaded = true;
        }
    }
}

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const phone = '5522999229542';
  const cleanPhone = '22999229542';
  
  // 1. Inbound Queue
  const { data: inbound } = await supabase
    .from('inbound_queue')
    .select('id, status, error_message, created_at, payload')
    .or(`payload->>phone.eq.${phone},payload->>phone.eq.${cleanPhone}`);
  console.log('--- INBOUND QUEUE ---');
  console.log(inbound);

  // 2. Outbound Queue
  const { data: outbound } = await supabase
    .from('outbound_queue')
    .select('id, status, error_message, created_at, metadata, contact_phone')
    .or(`contact_phone.eq.${phone},contact_phone.eq.${cleanPhone}`);
  console.log('\n--- OUTBOUND QUEUE ---');
  console.log(outbound);

  // 3. Conversation
  const { data: convs } = await supabase
    .from('conversations')
    .select('id, status, user_identifier')
    .or(`user_identifier.eq.${phone},user_identifier.eq.${cleanPhone}`);
  console.log('\n--- CONVERSATIONS ---');
  console.log(convs);

  if (convs && convs.length > 0) {
    const convIds = convs.map(c => c.id);
    const { data: messages } = await supabase
      .from('messages')
      .select('id, content, direction, status, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })
      .limit(10);
    console.log('\n--- MESSAGES ---');
    console.log(messages);
  }
}

run();
