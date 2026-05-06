const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envConfig = {};
envContent.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value.length > 0) envConfig[key.trim()] = value.join('=').trim();
});

const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY);

async function checkSofia() {
    const { data, error } = await supabase
        .from('agents')
        .select('*')
        .ilike('name', '%Sofia%');
    
    if (error) {
        console.error('Erro ao buscar agentes:', error);
        return;
    }

    console.log('--- AGENTES ENCONTRADOS ---');
    data.forEach(agent => {
        console.log(`ID: ${agent.id}`);
        console.log(`Nome: ${agent.name}`);
        console.log(`Status: ${agent.status}`);
        console.log(`Zenvia Channel ID: ${agent.zenvia_channel_id}`);
        console.log(`Connection Config: ${JSON.stringify(agent.connection_config, null, 2)}`);
        console.log('---------------------------');
    });
}

checkSofia().catch(console.error);
