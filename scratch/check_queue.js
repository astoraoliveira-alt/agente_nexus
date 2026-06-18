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
  const campaignId = 'cde33148-e954-4366-aa97-d4e89399c0c5';

  const { data, error } = await supabase.from('outbound_queue')
    .select('id, contact_phone, status, sent_at, scheduled_at, last_attempt_at, created_at')
    .eq('campaign_id', campaignId);

  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Leads queue:", data);
  }
  
  const { data: cap, error: e2 } = await supabase.from('contact_pressure_logs')
    .select('*')
    .eq('campaign_id', campaignId);
    
  console.log("Pressure logs:", cap);

  process.exit(0);
}

run();
