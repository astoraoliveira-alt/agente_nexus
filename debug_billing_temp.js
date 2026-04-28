
import { createClient } from '@supabase/supabase-js';

// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are loaded via --env-file
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const conversationIds = [
  '8194f4eb-d471-41b8-9b83-ae6c57ae9a42', // Marcelo
  'd1b1905b-733a-4b61-a61a-211e9fa923e8', // Francisco
  '2ad312a3-cc34-4040-8e7a-07a40f0344d2'  // Gustavo
];

async function debug() {
  console.log("--- MESSAGES ---");
  const { data: messages, error: mError } = await supabase
    .from('messages')
    .select('conversation_id, sender_type, content, created_at, status, direction')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: true });

  if (mError) {
    console.error("Error fetching messages:", mError);
  } else {
    console.log(JSON.stringify(messages, null, 2));
  }

  console.log("\n--- INBOUND QUEUE ---");
  const { data: inbound, error: iError } = await supabase
    .from('inbound_queue')
    .select('conversation_id, status, n8n_execution_id, created_at, processed_at, error_message, payload')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: true });

  if (iError) {
    console.error("Error fetching inbound:", iError);
  } else {
    // Only log essential fields from payload to avoid clutter
    const formattedInbound = inbound.map(i => ({
      ...i,
      content: i.payload?.content || i.payload?.text || "N/A"
    }));
    console.log(JSON.stringify(formattedInbound, null, 2));
  }
  
  console.log("\n--- BILLING WINDOWS ---");
  const { data: windows, error: wError } = await supabase
    .from('whatsapp_billing_windows')
    .select('*')
    .in('conversation_id', conversationIds);
    
  if (wError) {
    console.error("Error fetching windows:", wError);
  } else {
    console.log(JSON.stringify(windows, null, 2));
  }
}

debug();
