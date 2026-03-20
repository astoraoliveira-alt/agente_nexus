import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);

const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
    const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('identifier', '5511993434870');

    console.log('Result length:', data?.length);
    if (data?.length > 0) console.log(data[0]);
    console.log('Error:', error);

    // also check if "ad7ca404-ee2e-468e-9eb9-40d69d7c8122" is valid
    const { data: q1 } = await supabase.from('companies').select('*').eq('id', 'ad7ca404-ee2e-468e-9eb9-40d69d7c8122');
    console.log('Company found:', q1?.length > 0);
}

run();
