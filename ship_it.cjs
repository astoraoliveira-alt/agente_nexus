const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(url, serviceRole);

const sqlFile = process.argv[2];
if (!sqlFile) {
    console.error("Uso: node ship_it.cjs <arquivo.sql>");
    process.exit(1);
}

const sql = fs.readFileSync(sqlFile, 'utf8');

async function deploy() {
    console.log(`🚀 Tentando deploy de ${sqlFile} via RPCs conhecidos...`);
    
    // Tenta uma lista de nomes possíveis para o RPC de execução de SQL
    const rpcNames = ['exec_sql', 'fn_execute_sql', 'run_sql', 'execute_sql'];
    const params = ['sql_string', 'sql_query', 'query', 'p_query'];

    for (const name of rpcNames) {
        for (const param of params) {
            console.log(`Testando rpc('${name}', { ${param}: ... })`);
            const { data, error } = await supabase.rpc(name, { [param]: sql });
            
            if (!error) {
                console.log(`✅ SUCESSO via ${name}!`);
                return;
            }
            if (error.code !== 'PGRST202') { // Se não for 404 (função não encontrada), pode ser erro de SQL
                console.error(`❌ Erro no SQL via ${name}:`, error.message);
                return;
            }
        }
    }
    
    console.error("❌ Falha: Nenhum RPC de execução de SQL encontrado ou acessível.");
    console.log("\n💡 DICA: Por favor, copie o conteúdo de " + sqlFile + " e cole no 'SQL Editor' do seu painel Supabase para aplicar a correção manualmente.");
}

deploy();
