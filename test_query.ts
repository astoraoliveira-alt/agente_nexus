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

async function testQuery() {
  const { data, error } = await supabase
    .from('outbound_queue')
    .select('id, contact_name, status, scheduled_at, campaign_id')
    .eq('status', 'pending')
    .limit(10);
    
  if (error) {
    console.error("ERRO:", error);
  } else {
    console.log("Leads encontrados que estão pendentes:");
    data.forEach(lead => {
       console.log(`- Campanha: ${lead.campaign_id} | Nome: ${lead.contact_name} | Agendado para: ${lead.scheduled_at || 'Imediato'} | Status: ${lead.status}`);
    });
  }
}

testQuery();
