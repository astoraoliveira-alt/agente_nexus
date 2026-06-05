import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const env: Record<string, string> = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1]] = match[2];
  }
});

const supabase = createClient(env['VITE_SUPABASE_URL'], env['VITE_SUPABASE_ANON_KEY']);

async function check() {
  const { data, error } = await supabase
    .rpc('get_function_def', { func_name: 'handle_outbound_sent' });

  if (error) {
    // If we don't have a helper, we can't easily fetch function def via Data API.
    // Let's just do a manual check if it behaves identically.
    console.error("Can't read function directly via rpc");
  } else {
    console.log(data);
  }
}

check();
