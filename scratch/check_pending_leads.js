import { createClient } from '@supabase/supabase-js';

async function run() {
    const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
    const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
    const supabase = createClient(url, key);

    const campaignId = 'a3a9ec7e-af4d-40a2-ba22-a2d1e189981d';
    const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

    // Get 5 pending leads
    const { data: pendingLeads, error: plError } = await supabase
        .from('outbound_queue')
        .select('id, contact_phone, contact_name')
        .eq('campaign_id', campaignId)
        .eq('status', 'pending')
        .limit(10);

    if (plError) {
        console.error("Error fetching pending leads:", plError);
        return;
    }

    console.log(`Checking ${pendingLeads.length} sample pending leads for capping...`);

    for (const lead of pendingLeads) {
        // Check if there is a pressure log in the last 24 hours
        const { data: pressureLogs, error: prError } = await supabase
            .from('contact_pressure_logs')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('contact_phone', lead.contact_phone)
            .gt('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        if (prError) {
            console.error(`Error checking pressure logs for ${lead.contact_phone}:`, prError);
        } else {
            console.log(`Lead: ${lead.contact_name} (${lead.contact_phone}) | Active pressure logs in last 24h: ${pressureLogs.length}`);
            if (pressureLogs.length > 0) {
                console.log("   -> Pressure log details:", pressureLogs.map(l => ({ campaign_id: l.campaign_id, sent_at: l.sent_at })));
            }
        }
    }
}

run();
