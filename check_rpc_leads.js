import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(url, serviceRole);

async function checkNextLeads() {
    console.log("Calling get_next_leads_secure...");
    
    // Tentamos simular o que o n8n faz
    const { data, error } = await supabase.rpc('get_next_leads_secure', {
        p_limit: 10
    });
    
    if (error) {
        console.error("Error calling RPC:", error);
        return;
    }
    
    console.log(`RPC returned ${data?.length || 0} leads.`);
    data?.forEach(l => {
        console.log(`- ID: ${l.id} | Phone: ${l.phone} | Agent: ${l.agent_id} | Campaign: ${l.campaign_id}`);
    });
}

checkNextLeads();
