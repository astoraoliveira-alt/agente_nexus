import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv(filePath) {
    try {
        const content = readFileSync(filePath, 'utf8');
        content.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join('=').trim();
                process.env[key] = value;
            }
        });
    } catch(e) {}
}

loadEnv(path.join(__dirname, '../porteiro/.env'));

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function check() {
  const campaignId = '9278ec92-c36c-48b4-9c8e-0ca6f0e69e38'; // From the screenshot
  
  const { data: camp, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (error) {
    console.error("Error fetching campaign:", error);
    process.exit(1);
  }
  
  console.log("Campaign configuration:", JSON.stringify(camp, null, 2));
  
  const { count: totalLeads } = await supabase
    .from('outbound_queue')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId);
    
  const { count: pendingLeads } = await supabase
    .from('outbound_queue')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'pending');
    
  console.log(`Total Leads: ${totalLeads}, Pending: ${pendingLeads}`);

  // Fetch some leads to check scheduled_at, etc
  const { data: leads } = await supabase
    .from('outbound_queue')
    .select('id, status, scheduled_at, created_at, tenant_id')
    .eq('campaign_id', campaignId)
    .limit(3);
    
  console.log("Sample leads:", leads);
  
  process.exit(0);
}

check();
