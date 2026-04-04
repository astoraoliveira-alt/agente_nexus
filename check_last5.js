import { createClient } from '@supabase/supabase-js';

async function checkLast5() {
    const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
    const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
    const supabase = createClient(url, serviceKey);
    
    const { data: queue } = await supabase
        .from('outbound_queue')
        .select('*, campaigns!inner(name)')
        .order('created_at', { ascending: false })
        .limit(5);
        
    console.log("Last 5 items in queue:");
    queue?.forEach(q => {
        console.log(`- [${q.status}] Name: ${q.contact_name}, Phone: ${q.contact_phone}, Campaign: ${q.campaigns.name}, Error: ${q.error_message}`);
    });
}

checkLast5();
