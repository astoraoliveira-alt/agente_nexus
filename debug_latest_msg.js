
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function debug() {
  console.log("--- LATEST MESSAGES ---");
  const { data: messages, error } = await supabase
    .from('messages')
    .select('conversation_id, sender_name, content, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error("Error fetching messages:", error);
  } else {
    console.log(JSON.stringify(messages, null, 2));
  }
}

debug();
