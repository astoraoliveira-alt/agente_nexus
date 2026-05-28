const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const anonKeyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(viteUrlMatch[1].trim(), anonKeyMatch[1].trim());
const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851'; // Edenred

async function run() {
  console.log('Logging in as Carlos...');
  await supabase.auth.signInWithPassword({
    email: 'carlos@davos.ai',
    password: '123456'
  });

  const { data: conv, error } = await supabase
    .from('conversations')
    .select('id, user_name, status, last_message_at')
    .eq('id', 'e1561f30-ff68-4e41-8871-c2ae12a97aa0');

  console.log('Query result for active conversation e1561f30... under RLS:');
  console.log(data = conv || error);
}

run();
