import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import path from 'path';

function loadEnv() {
    try {
        const content = readFileSync(path.join(process.cwd(), 'porteiro/.env'), 'utf8');
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

loadEnv();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const { data } = await supabase.rpc('test_query_raw', {
      q: "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'handle_message_status_update'"
  });
  console.log("handle_message_status_update:", data);
}
run();
