import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(url, serviceRole);

async function checkLeads() {
    const cnpjs = ['98589096000501', '98589096000502'];
    console.log("Checking agent_leads for CNPJs...");
    
    const { data: leads } = await supabase
        .from('agent_leads')
        .select('identifier, whatsapp, campaign_id, status')
        .in('identifier', cnpjs);
    
    console.log(`Found ${leads?.length || 0} leads.`);
    leads?.forEach(l => {
        console.log(`- CNPJ: ${l.identifier} | Phone: ${l.whatsapp} | Campaign: ${l.campaign_id} | Status: ${l.status}`);
    });
}

checkLeads();
