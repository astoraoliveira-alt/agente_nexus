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
  const tenantId = process.argv[2] || 'd290f1ee-6c54-4b01-90e6-d701748f0851';
  const campaignId = process.argv[3] || '9278ec92-c36c-48b4-9c8e-0ca6f0e69e38';
  console.log(`Checking tenant: ${tenantId}, campaign: ${campaignId}`);

  const { data, error } = await supabase.rpc('get_next_leads_secure', {
    p_tenant_id: tenantId,
    p_campaign_id: campaignId,
    p_limit: 10
  });

  if (error) {
    console.error("Error calling get_next_leads_secure:", error);
  } else {
    console.log("Success! Leads returned:", data?.length);
    console.dir(data, { depth: null });
  }

  process.exit(0);
}

run();
