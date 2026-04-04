import { createClient } from '@supabase/supabase-js';

async function checkCampaignInitMessage() {
    const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
    const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
    
    const supabase = createClient(url, serviceKey);
    
    const { data: campaigns } = await supabase
        .from('campaigns')
        .select('*')
        .ilike('name', '%Teste Inicial%')
        .order('created_at', { ascending: false })
        .limit(1);
        
    const camp = campaigns[0];
    console.log(`Campaign Name: ${camp.name}`);
    console.log(`Initial Message: "${camp.initial_message}"`);
}

checkCampaignInitMessage();
