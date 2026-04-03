const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './porteiro/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkCols() {
  const { data: cols, error: qError } = await supabase
    .from('agents')
    .select('*')
    .limit(1);
  
  if (qError) {
    console.error('❌ Erro ao buscar colunas de agents:', qError);
    return;
  }
  console.log('✅ Colunas encontradas em agents:', Object.keys(cols[0]));
  console.log('📦 Exemplo do registro (parcial):', { 
    id: cols[0].id, 
    name: cols[0].name, 
    greeting: cols[0].greeting_message,
    brain: cols[0].brain_config 
  });
}

checkCols();
