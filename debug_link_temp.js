
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function debug() {
  console.log("--- SAMPLING MESSAGES AND THEIR CONVERSATIONS ---");
  const { data: messages } = await supabase
    .from('messages')
    .select('conversation_id, sender_name, content')
    .order('created_at', { ascending: false })
    .limit(5);

  for (const m of messages || []) {
    console.log(`Message from ${m.sender_name}: ${m.content.substring(0, 20)}... (ConvID: ${m.conversation_id})`);
    const { data: conv, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', m.conversation_id)
      .single();
    
    if (error) {
        console.log(`  -> Conv Error: ${error.message} (Code: ${error.code})`);
    } else {
        console.log(`  -> Conv Found: ${conv.id} | Status: ${conv.status}`);
    }
  }
}

debug();
