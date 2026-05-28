const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const anonKeyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(viteUrlMatch[1].trim(), anonKeyMatch[1].trim());
const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851'; // Edenred

async function run() {
  console.log('Logging in as Carlos...');
  const { data: sessionData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'carlos@davos.ai',
    password: '123456'
  });

  if (authError) {
    console.error('Auth error:', authError);
    return;
  }

  const { data: conversations, error: convError } = await supabase
    .from('conversations')
    .select('*, agents:agent_id(name, type)')
    .eq('tenant_id', tenantId)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (convError) {
    console.error('Conv error:', convError);
    return;
  }

  console.log('Total conversations returned:', conversations.length);
  console.log('Unique statuses in returned conversations:', [...new Set(conversations.map(c => c.status))]);
  
  const active = conversations.filter(c => c.status !== 'closed');
  console.log('Active conversations:', active.map(c => ({ id: c.id, name: c.user_name, status: c.status, last_message_at: c.last_message_at })));
  
  console.log('First 5 conversations:');
  console.log(conversations.slice(0, 5).map(c => ({ id: c.id, name: c.user_name, status: c.status, last_message_at: c.last_message_at })));
}

run();
