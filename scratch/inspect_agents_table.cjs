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

async function inspectAgentsTable() {
    // List some rows to see keys
    const { data, error } = await supabase
        .from('agents')
        .select('*')
        .limit(1);
    
    if (error) {
        console.error('Erro ao buscar agentes:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log('Colunas da tabela agents:', Object.keys(data[0]));
        console.log('Primeiro agente:', JSON.stringify(data[0], null, 2));
    } else {
        console.log('Tabela agents está vazia.');
    }
}

inspectAgentsTable().catch(console.error);
