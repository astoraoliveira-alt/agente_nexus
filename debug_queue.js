import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

async function checkQueue() {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const url = envFile.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
    const key = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();
    
    const supabase = createClient(url, key);
    
    // Find the latest campaign named "Teste Inicial"
    const { data: campaigns, error: cError } = await supabase
        .from('campaigns')
        .select('*')
        .ilike('name', '%Teste Inicial%')
        .order('created_at', { ascending: false });
        
    if (cError || !campaigns.length) {
        console.log("Campaign not found", cError);
        return;
    }
    
    const camp = campaigns[0];
    console.log("Campaign ID:", camp.id);
    console.log("Campaign Failed Count:", camp.failed_count);
    
    // Check elements in outbound_queue for this campaign
    const { data: queue, error: qError } = await supabase
        .from('outbound_queue')
        .select('*')
        .eq('campaign_id', camp.id);
        
    if (qError) {
        console.log("Error fetching queue", qError);
        return;
    }
    
    console.log("Queue size:", queue.length);
    queue.forEach(item => {
        console.log(`- ID: ${item.id}, Status: ${item.status}, Phone: ${item.contact_phone}, Error: ${item.error_message}`);
    });
}

checkQueue();
