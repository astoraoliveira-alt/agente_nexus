
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function debug() {
  console.log("--- OUTBOUND QUEUE (ALL LATEST) ---");
  const { data: outbound, error } = await supabase
    .from('outbound_queue')
    .select('*, conversations!conversation_id(status)')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error("Error fetching outbound:", error);
  } else {
    console.log(JSON.stringify(outbound, null, 2));
  }
}

debug();
