import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(url, key);

async function check() {
    const { data: leads } = await supabase
        .from('agent_leads')
        .select('*')
        .or('whatsapp.ilike.%993434870%,whatsapp.ilike.%99343-4870%');

    console.log('--- ALL LEADS ---');
    leads?.forEach(lead => {
        console.log(`ID: ${lead.id}`);
        console.log(`Name: ${lead.name}`);
        console.log(`Phone: ${lead.whatsapp}`);
        console.log(`CNPJ: ${lead.identifier}`);
        console.log(`Link: ${lead.cta_link}`);
        console.log(`Created At: ${lead.created_at}`);
        console.log('---------------------');
    });
}

check();
