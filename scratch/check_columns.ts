import { supabase } from '../src/lib/supabase';

async function check() {
  const { data, error } = await supabase.from('conversations').select('*').limit(1);
  if (error) console.error("Conversations error:", error);
  else console.log("Conversations columns:", Object.keys(data[0] || {}));
}

check();
