import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);

const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
    const newIdentifier = '11122233344';

    // Call RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_or_create_conversation', {
        p_tenant_id: 'ad7ca404-ee2e-468e-9eb9-40d69d7c8122',
        p_agent_id: 'f579ddce-0637-488b-ab7f-4570e9022505',
        p_user_identifier: newIdentifier,
        p_user_name: 'RPC Test Name',
        p_metadata: { source: 'rpc_direct' },
        p_phone: '+5511122233344'
    });
    console.log('RPC Result:', rpcData);
    console.log('RPC Error:', rpcError);

    // Check Contacts
    const { data: qData } = await supabase.from('contacts').select('*').eq('identifier', newIdentifier);
    console.log('Found Contact:', qData);
}

run();
