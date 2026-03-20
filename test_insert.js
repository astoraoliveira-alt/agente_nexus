import { createClient } from '@supabase/supabase-js';
import process from 'process';

// Get keys from .env.local format manually
import fs from 'fs';
const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const viteKeyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(viteUrlMatch[1].trim(), viteKeyMatch[1].trim());

async function run() {
  const payload = {
    "message": {
      "timestamp": 1772754550153,
      "type": "end-of-call-report",
      "artifact": { "messages": [] }
    }
  };

  const { data, error } = await supabase.rpc('sync_vapi_call', {
    p_tenant_id: 'ad7ca404-ee2e-468e-9eb9-40d69d7c8122',
    p_vapi_payload: payload,
    p_user_identifier: '+5511993434870',
    p_user_name: 'Astor Oliveira',
    p_agent_id: 'f579ddce-0637-488b-ab7f-4570e9022505'
  });

  console.log('Result:', data);
  console.log('Error:', error);
}

run();
