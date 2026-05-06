import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(url, serviceRole);

async function checkSystem() {
    const { data: companies } = await supabase.from('companies').select('id, name');
    console.log("Companies:", companies?.length);
    
    const { data: agents } = await supabase.from('agents').select('id, name');
    console.log("Agents:", agents?.length);
    
    const { data: campaigns } = await supabase.from('campaigns').select('id, name, agent_id');
    console.log("Campaigns:", campaigns?.length);
    if (campaigns && campaigns.length > 0) {
        console.log("Latest Campaign Agent ID:", campaigns[0].agent_id);
    }
}

checkSystem();
