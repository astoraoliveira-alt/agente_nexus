const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const anonKeyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabaseUrl = viteUrlMatch[1].trim();
const supabaseAnonKey = anonKeyMatch[1].trim();

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    console.log('Logging in user carlos@davos.ai...');
    const { data: { session }, error: loginError } = await supabase.auth.signInWithPassword({
        email: 'carlos@davos.ai',
        password: '123456'
    });

    if (loginError || !session) {
        console.error('❌ Login Error:', loginError?.message);
        return;
    }

    console.log('User metadata:', session.user.user_metadata);
    
    // Let's query all schema_view_configs using service role
    const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
    const adminSupabase = createClient(supabaseUrl, serviceKey);
    const { data: allConfigs } = await adminSupabase.from('schema_view_config').select('*');
    console.log('All View Configs in DB:', allConfigs);
}

run();
