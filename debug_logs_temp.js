
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function debug() {
  console.log("--- LATEST INTEGRATION LOGS ---");
  const { data: logs, error } = await supabase
    .from('integration_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error("Error fetching logs:", error);
  } else {
    console.log(JSON.stringify(logs, null, 2));
  }
}

debug();
