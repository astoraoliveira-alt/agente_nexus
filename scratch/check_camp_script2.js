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

async function runTest() {
  const campaignId = '9278ec92-c36c-48b4-9c8e-0ca6f0e69e38'; 
  const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

  // Test the v_allowed_now logic
  const { data, error } = await supabase.rpc('test_query_raw_sql', {
     query: `
        SELECT 
            camp.daily_limit,
            camp.capping_config,
            (NOW() AT TIME ZONE 'America/Sao_Paulo')::date as curr_date,
            (NOW() AT TIME ZONE 'America/Sao_Paulo')::time as curr_time,
            camp.start_date,
            camp.end_date,
            camp.start_time,
            camp.end_time,
            (
                (NOW() AT TIME ZONE 'America/Sao_Paulo')::date >= COALESCE(camp.start_date, '2000-01-01'::date) AND 
                (NOW() AT TIME ZONE 'America/Sao_Paulo')::date <= COALESCE(camp.end_date, (camp.start_date + INTERVAL '14 days')::date, '2099-12-31'::date) AND
                (NOW() AT TIME ZONE 'America/Sao_Paulo')::time >= COALESCE(camp.start_time::text, '00:00:00')::time AND 
                (NOW() AT TIME ZONE 'America/Sao_Paulo')::time <= COALESCE(camp.end_time::text, '23:59:59')::time
            ) as v_allowed_now
        FROM public.campaigns camp
        WHERE camp.id = '${campaignId}' AND camp.status = 'active';
     `
  });

  if (error) {
    console.error("Error executing RPC:", error);
    // Maybe we need to do it by creating a function temporarily
  } else {
    console.log("v_allowed_now Result:", data);
  }
  
  process.exit(0);
}

runTest();
