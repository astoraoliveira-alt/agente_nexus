
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function debug() {
  const agentId = '0e5a2927-1617-48a7-9e54-0834ddbbc924';
  console.log(`--- CHECKING AGENT: ${agentId} ---`);
  const { data: agent, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (error) {
    console.error("Error fetching agent:", error);
  } else {
    console.log(JSON.stringify(agent, null, 2));
  }
}

debug();
