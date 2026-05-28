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

  console.log('Auth success. Querying conversations...');
  const { data: conversations, error: convError } = await supabase
    .from('conversations')
    .select('id, user_name, status, last_message_at')
    .eq('tenant_id', tenantId)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (convError) {
    console.error('Conv error:', convError);
    return;
  }

  console.log('Total conversations returned under RLS:', conversations.length);
  const active = conversations.filter(c => c.status !== 'closed');
  console.log(`Active conversations count: ${active.length}`);
  console.log('Active ones:', active);
  
  console.log('First 5 in list:');
  console.log(conversations.slice(0, 5));
}

run();
