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

async function listTables() {
    // In Supabase, we can't easily list tables via client unless we use RPC
    // But we can try to query common tables
    const tables = ['agents', 'leads', 'messages', 'campaigns', 'connections'];
    for (const table of tables) {
        const { count, error } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });
        
        if (error) {
            console.log(`Tabela ${table}: Erro ou não existe (${error.message})`);
        } else {
            console.log(`Tabela ${table}: ${count} registros`);
        }
    }
}

listTables().catch(console.error);
