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

const serviceKey = env['N8N_ENV_SUPABASE_KEY_AGENT'] || env['VITE_SUPABASE_ANON_KEY'];
const supabase = createClient(env['VITE_SUPABASE_URL'], serviceKey);

async function check() {
  // Chamamos um endpoint público para pegar a definicao ou apenas pegamos via REST se der erro
  // Como nao temos service_role_key facil, vou usar um select publico que n8n usa:
  // n8n usa N8N_ENV_SUPABASE_KEY_AGENT que não temos, entao vou usar o sql raw:
}
check();
