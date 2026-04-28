
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function debug() {
  console.log("--- CONVERSATIONS COUNT ---");
  const { count, error } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error("Error fetching convs count:", error);
  } else {
    console.log("Total conversations:", count);
  }
}

debug();
