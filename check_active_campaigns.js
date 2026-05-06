import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(url, serviceRole);

async function checkAllActive() {
    const { data: campaigns } = await supabase
        .from('campaigns')
        .select('id, name, status')
        .eq('status', 'active');

    console.log(`Active Campaigns: ${campaigns?.length || 0}`);
    for (const c of campaigns || []) {
        const { data: queue } = await supabase
            .from('outbound_queue')
            .select('contact_phone, status')
            .eq('campaign_id', c.id);
        
        console.log(`- Campaign: ${c.name} (${c.id}) has ${queue?.length || 0} leads.`);
        queue?.forEach(q => {
            if (q.status !== 'pending' && q.status !== 'rejected') {
                 console.log(`  * Sent to: ${q.contact_phone} (Status: ${q.status})`);
            }
        });
    }
}

checkAllActive();
