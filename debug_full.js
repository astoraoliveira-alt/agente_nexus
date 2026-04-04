import { createClient } from '@supabase/supabase-js';

async function listAllData() {
    const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
    const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
    
    const supabase = createClient(url, serviceKey);
    
    // Find campaign
    const { data: campaigns, error: cErr } = await supabase
        .from('campaigns')
        .select('*')
        .ilike('name', '%Teste Inicial%')
        .order('created_at', { ascending: false });
        
    if (cErr) {
        console.log("Error campaigns:", cErr);
        return;
    }
    
    if (!campaigns.length) {
        console.log("No campaign found with that name. Total campaigns in DB:");
        const { data: all } = await supabase.from('campaigns').select('name, id').limit(5);
        all?.forEach(c => console.log(`- ${c.name} (${c.id})`));
        return;
    }
    
    const camp = campaigns[0];
    console.log(`Campaign: ${camp.name} (${camp.id})`);
    console.log(`Leads (total_contacts): ${camp.total_contacts}`);
    console.log(`Sent: ${camp.sent_count}, Failed: ${camp.failed_count}`);
    
    // Check queue
    const { data: queue, error: qErr } = await supabase
        .from('outbound_queue')
        .select('*')
        .eq('campaign_id', camp.id);
        
    if (qErr) {
        console.log("Error queue:", qErr);
        return;
    }
    
    console.log(`In Queue: ${queue.length} items`);
    queue.forEach(item => {
        console.log(`- [${item.status}] Phone: ${item.contact_phone}, Name: ${item.contact_name}, Error: ${item.error_message}`);
    });
}

listAllData();
