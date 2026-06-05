const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtrc3BtdmtwcXhkcGR5YnByY25qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMTAyMTk0NCwiZXhwIjoyMDQ2NjAwMzQ0fQ.rUcwX8x00q6G2h7L0h1Ea64z0Vl_c7vV-h_5FhG_5H8';
const supabaseUrl = viteUrlMatch ? viteUrlMatch[1] : '';
const supabase = createClient(supabaseUrl, serviceKey);

async function checkQueue() {
    const { data: campaign } = await supabase
        .from('campaigns')
        .select('id, name')
        .ilike('name', '%01.06%')
        .limit(1)
        .single();
        
    if (!campaign) {
        console.log('Campaign not found.');
        const {data: all} = await supabase.from('campaigns').select('id, name');
        console.log('Available campaigns:', all);
        return;
    }

    console.log(`Campaign: ${campaign.name} (${campaign.id})`);

    const { data, error: err2 } = await supabase
        .from('outbound_queue')
        .select('status, reengagement_attempt_count, error_message')
        .eq('campaign_id', campaign.id);

    if (err2) {
        console.error('Error fetching queue:', err2);
        return;
    }

    const counts = {};
    for (const row of data) {
        const key = `${row.status} (attempt: ${row.reengagement_attempt_count})`;
        counts[key] = (counts[key] || 0) + 1;
        if (row.status === 'failed' || row.status === 'cancelled') {
            const errKey = `Error: ${row.error_message}`;
            counts[errKey] = (counts[errKey] || 0) + 1;
        }
    }

    console.log('Current status counts:');
    console.table(counts);
}

checkQueue();
