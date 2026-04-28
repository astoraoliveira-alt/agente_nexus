
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://wyfmyipbvoggusclwdhj.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU');

const conversationIds = [
  '8194f4eb-d471-41b8-9b83-ae6c57ae9a42', // Marcelo
  'd1b1905b-733a-4b61-a61a-211e9fa923e8', // Francisco
  '2ad312a3-cc34-4040-8e7a-07a40f0344d2'  // Gustavo
];

async function debug() {
  console.log("--- REAL DATA (SERVICE ROLE) ---");
  
  for (const cid of conversationIds) {
    console.log(`\n=== CONVERSATION: ${cid} ===`);
    
    const { data: conv } = await supabase
      .from('conversations')
      .select('*, agents(name)')
      .eq('id', cid)
      .single();
    
    if (conv) {
        console.log(`Conversation Found: ${conv.id} | Agent: ${conv.agents?.name} | Status: ${conv.status}`);
    } else {
        console.log("Conversation NOT FOUND in database!");
    }

    const { data: messages } = await supabase
      .from('messages')
      .select('sender_type, content, created_at')
      .eq('conversation_id', cid)
      .order('created_at', { ascending: true });

    console.log("Messages:");
    messages?.forEach(m => {
      console.log(`[${m.created_at}] ${m.sender_type.toUpperCase()}: ${m.content.substring(0, 50)}...`);
    });

    const { data: queue } = await supabase
      .from('inbound_queue')
      .select('status, n8n_execution_id, error_message, payload, created_at, processed_at')
      .eq('conversation_id', cid)
      .order('created_at', { ascending: true });

    console.log("\nInbound Queue:");
    queue?.forEach(q => {
      console.log(`[${q.created_at}] Status: ${q.status} | n8n: ${q.n8n_execution_id} | Content: ${q.payload?.content || q.payload?.text}`);
      if (q.error_message) console.log(`  !! Error: ${q.error_message}`);
    });
  }
}

debug();
