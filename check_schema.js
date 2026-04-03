const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './porteiro/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkCols() {
  const { data, error } = await supabase.rpc('fn_check_table_cols', { p_table: 'agent_leads' });
  
  if (error) {
    // Se a RPC não existe, tentamos via query direta (se service role permitir)
    const { data: cols, error: qError } = await supabase
      .from('agent_leads')
      .select('*')
      .limit(1);
    
    if (qError) {
      console.error('❌ Erro ao buscar colunas:', qError);
      return;
    }
    console.log('✅ Colunas encontradas:', Object.keys(cols[0]));
  } else {
    console.log('✅ Resultado RPC:', data);
  }
}

checkCols();
