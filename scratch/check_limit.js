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

async function run() {
  const campaignId = '9278ec92-c36c-48b4-9c8e-0ca6f0e69e38';

  const { data, error } = await supabase.from('campaigns')
    .select('daily_limit, capping_config')
    .eq('id', campaignId);

  const { data: q, error: qErr } = await supabase.from('outbound_queue')
    .select('status, sent_at')
    .eq('campaign_id', campaignId)
    .in('status', ['sent', 'delivered', 'read']);

  console.log("Campaign limit config:", data);
  console.log("Total sent/delivered/read:", q ? q.length : 0);

  // Let's also check if these 3000 leads exist in pressure logs
  const { data: p, error: pErr } = await supabase.from('contact_pressure_logs')
    .select('contact_phone')
    .limit(10);
  
  console.log("Some pressure logs:", p);
  
  process.exit(0);
}

run();
