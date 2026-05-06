const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://wyfmyipbvoggusclwdhj.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU');

async function debugAgents() {
    // We try to get one row to see the keys
    const { data, error } = await supabase.from('agents').select('*').limit(1);
    
    if (error) {
        console.error('Erro:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log('--- COLUNAS ---');
        console.log(Object.keys(data[0]));
        console.log('--- DADOS ---');
        console.log(JSON.stringify(data[0], null, 2));
    } else {
        console.log('Tabela vazia ou sem acesso.');
    }
}

debugAgents();
