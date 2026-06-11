const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from various possible paths
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
    if (!loaded) {
        console.error('No env files found.');
    }
}

loadEnv();

// Log keys (safely, no secrets)
console.log('Loaded keys:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase URL or Key is missing.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const phone = '5522999229542';
  const cleanPhone = '22999229542';
  
  console.log(`=== CHECKING STATUS FOR PHONE: ${phone} ===\n`);

  // 1. Inbound Queue
  console.log('1. Checking inbound_queue...');
  const { data: inbound, error: errInbound } = await supabase
    .from('inbound_queue')
    .select('id, status, error_message, created_at, payload')
    .or(`payload->>phone.eq.${phone},payload->>phone.eq.${cleanPhone}`)
    .order('created_at', { ascending: false });
    
  if (errInbound) console.error('Error fetching inbound_queue:', errInbound);
  else console.log(JSON.stringify(inbound, null, 2));

  // 2. Outbound Queue
  console.log('\n2. Checking outbound_queue...');
  const { data: outbound, error: errOutbound } = await supabase
    .from('outbound_queue')
    .select('id, status, error_message, created_at, metadata, contact_phone')
    .or(`contact_phone.eq.${phone},contact_phone.eq.${cleanPhone}`)
    .order('created_at', { ascending: false });

  if (errOutbound) console.error('Error fetching outbound_queue:', errOutbound);
  else console.log(JSON.stringify(outbound, null, 2));

  // 3. Conversation & Messages
  console.log('\n3. Checking conversation and messages...');
  const { data: convs, error: errConvs } = await supabase
    .from('conversations')
    .select('id, status, user_identifier, user_name')
    .or(`user_identifier.eq.${phone},user_identifier.eq.${cleanPhone}`);

  if (errConvs) {
    console.error('Error fetching conversations:', errConvs);
  } else {
    console.log('Conversations:', JSON.stringify(convs, null, 2));
    for (const conv of convs) {
      const { data: messages, error: errMsgs } = await supabase
        .from('messages')
        .select('id, content, direction, status, sender_type, created_at, metadata')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (errMsgs) console.error(`Error fetching messages for conv ${conv.id}:`, errMsgs);
      else console.log(`Last 5 messages for conv ${conv.id}:`, JSON.stringify(messages, null, 2));
    }
  }

  // 4. Integration Logs
  console.log('\n4. Checking integration_logs for provider=zenvia...');
  const { data: logs, error: errLogs } = await supabase
    .from('integration_logs')
    .select('id, provider, external_id, status, error_details, processed_at, payload')
    .eq('provider', 'zenvia')
    .order('processed_at', { ascending: false })
    .limit(10);

  if (errLogs) console.error('Error fetching integration_logs:', errLogs);
  else console.log(JSON.stringify(logs, null, 2));
}

run();
