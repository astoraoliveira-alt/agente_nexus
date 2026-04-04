import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

async function listCampaigns() {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const url = envFile.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
    const key = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();
    
    const supabase = createClient(url, key);
    
    const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select('id, name, status, created_at, failed_count')
        .order('created_at', { ascending: false });
        
    if (error) {
        console.log("Error fetching campaigns", error);
        return;
    }
    
    console.log("Found campaigns:", campaigns.length);
    campaigns.forEach(c => {
        console.log(`- ID: ${c.id}, Name: ${c.name}, Status: ${c.status}, Failed: ${c.failed_count}`);
    });
}

listCampaigns();
