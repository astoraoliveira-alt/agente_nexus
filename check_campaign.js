import { createClient } from '@supabase/supabase-js';

async function checkCampaign() {
    const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
    const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
    const supabase = createClient(url, key);
    
    const { data: c } = await supabase
        .from('campaigns')
        .select('*')
        .ilike('name', '%Astor%') // Look for the campaign being tested
        .limit(1);
    
    if (c && c[0]) {
        console.log(`Campaign Name: ${c[0].name}`);
        console.log(`Initial Message: ${c[0].initial_message}`);
    } else {
        // Just list all campaigns if not found
        const { data: all } = await supabase.from('campaigns').select('name, initial_message').limit(5);
        all?.forEach(c => console.log(`Campaign: ${c.name} | Message: ${c.initial_message}`));
    }
}

checkCampaign();
