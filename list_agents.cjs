
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join('/Users/user/SaaS - Davos Nexus/agent-nexus-hub', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envConfig = {};
envContent.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) envConfig[key.trim()] = value.join('=').trim();
});

const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY);

async function listAgents() {
    const { data, error } = await supabase
        .from('agents')
        .select('id, name, status, zenvia_channel_id');
    console.log(JSON.stringify(data, null, 2));
}

listAgents().catch(console.error);
