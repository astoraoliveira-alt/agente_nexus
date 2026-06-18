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

  const { data, error } = await supabase.from('outbound_queue')
    .select('status, contact_phone, sent_at, last_attempt_at')
    .eq('campaign_id', campaignId);

  if (error) {
    console.error("Error:", error);
  } else {
    const statuses = {};
    for (const row of data) {
      statuses[row.status] = (statuses[row.status] || 0) + 1;
    }
    console.log("Status distribution:", statuses);
    console.log("Total leads:", data.length);
  }
  
  process.exit(0);
}

run();
