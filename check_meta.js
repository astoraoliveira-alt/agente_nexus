import { createClient } from '@supabase/supabase-js';

async function checkMetadata() {
    const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
    const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
    const supabase = createClient(url, serviceKey);
    
    // Find campaign
    const { data: q } = await supabase
        .from('outbound_queue')
        .select('*')
        .ilike('contact_name', '%Astor%') // Search by name to find it directly
        .order('id', { ascending: false })
        .limit(1);
    
    if (q && q[0]) {
        console.log("Lead info:");
        console.log(`Phone: ${q[0].contact_phone}`);
        console.log(`Name: ${q[0].contact_name}`);
        console.log(`Metadata: ${JSON.stringify(q[0].metadata)}`);
    } else {
        console.log("Lead not found!");
    }
}

checkMetadata();
