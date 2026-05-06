import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(url, serviceRole);

async function debugQueue() {
    // 1. Get latest campaign
    const { data: campaigns, error: cError } = await supabase
        .from('campaigns')
        .select('id, name')
        .order('created_at', { ascending: false })
        .limit(1);

    if (cError || !campaigns.length) {
        console.error("Error/No campaigns:", cError);
        return;
    }

    const campaign = campaigns[0];
    console.log(`Checking campaign: ${campaign.name} (${campaign.id})`);

    // 2. Get queue for this campaign
    const { data: queue, error: qError } = await supabase
        .from('outbound_queue')
        .select('id, contact_name, contact_phone, status, metadata')
        .eq('campaign_id', campaign.id);

    if (qError) {
        console.error("Error fetching queue:", qError);
        return;
    }

    console.log(`Found ${queue.length} rows in queue.`);
    queue.forEach(row => {
        console.log(`- ${row.contact_name}: ${row.contact_phone} (Status: ${row.status})`);
    });
}

debugQueue();
