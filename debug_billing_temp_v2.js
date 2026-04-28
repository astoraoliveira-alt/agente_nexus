
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const conversationIds = [
  '8194f4eb-d471-41b8-9b83-ae6c57ae9a42', // Marcelo
  'd1b1905b-733a-4b61-a61a-211e9fa923e8', // Francisco
  '2ad312a3-cc34-4040-8e7a-07a40f0344d2'  // Gustavo
];

async function debug() {
  for (const cid of conversationIds) {
    console.log(`\n=== CONVERSATION: ${cid} ===`);
    
    const { data: messages } = await supabase
      .from('messages')
      .select('sender_type, content, created_at, direction')
      .eq('conversation_id', cid)
      .order('created_at', { ascending: true });

    console.log("Messages:");
    messages?.forEach(m => {
      console.log(`[${m.created_at}] ${m.sender_type.toUpperCase()}: ${m.content.substring(0, 50)}${m.content.length > 50 ? '...' : ''}`);
    });

    const { data: queue } = await supabase
      .from('inbound_queue')
      .select('status, n8n_execution_id, error_message, payload')
      .eq('conversation_id', cid);

    console.log("\nQueue Status:");
    queue?.forEach(q => {
      const content = q.payload?.content || q.payload?.text || "N/A";
      console.log(`Status: ${q.status} | n8n: ${q.n8n_execution_id} | Content: ${content}`);
      if (q.error_message) console.log(`Error: ${q.error_message}`);
    });
  }
}

debug();
