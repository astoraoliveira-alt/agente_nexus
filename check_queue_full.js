import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(url, serviceRole);

async function checkQueue() {
    const { data: campaigns } = await supabase
        .from('campaigns')
        .select('id, name')
        .order('created_at', { ascending: false })
        .limit(1);

    const campaignId = campaigns[0].id;
    console.log(`Campaign: ${campaigns[0].name} (${campaignId})`);

    const { data: queue } = await supabase
        .from('outbound_queue')
        .select('*')
        .eq('campaign_id', campaignId);

    console.log(`Queue size: ${queue?.length || 0}`);
    queue?.forEach(q => {
        console.log(`- ${q.contact_name}: ${q.contact_phone} | Status: ${q.status} | Error: ${q.error_message}`);
    });
}

checkQueue();
