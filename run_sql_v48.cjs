const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const sql = fs.readFileSync('database/create_queue_supervisor_rpc.sql', 'utf8');
  const { data, error } = await supabase.rpc('fn_execute_sql', { sql_query: sql });
  
  if (error) {
    if (error.message.includes('fn_execute_sql')) {
        console.log('⚠️ RPC standard execute não encontrado. Tentando via query raw...');
        // If no exec function, we can't run raw SQL easily via JS client 
        // without a custom helper function on the server.
    }
    console.error('❌ Erro no SQL:', error);
    return;
  }
  console.log('✅ SQL executado com sucesso (V48)!');
}

run();
