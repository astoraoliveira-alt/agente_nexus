import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(url, serviceRole);

async function checkSchema() {
    const { data, error } = await supabase.rpc('get_func_def', { p_name: 'conversations' });
    
    // Se o RPC acima não existir, vamos tentar um select de 1 linha
    const { data: sample, error: err2 } = await supabase.from('conversations').select('*').limit(1);
    
    if (sample && sample.length > 0) {
        console.log("Columns found in 'conversations':");
        console.log(Object.keys(sample[0]).join(", "));
    } else {
        console.log("No data in conversations or table not found.");
    }
}

checkSchema();
