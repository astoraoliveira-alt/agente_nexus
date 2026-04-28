
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const conversationIds = [
  '8194f4eb-d471-41b8-9b83-ae6c57ae9a42', // Marcelo
  'd1b1905b-733a-4b61-a61a-211e9fa923e8', // Francisco
  '2ad312a3-cc34-4040-8e7a-07a40f0344d2'  // Gustavo
];

async function debug() {
  console.log("--- CONVERSATIONS DATA ---");
  const { data: convs, error } = await supabase
    .from('conversations')
    .select('*, agents!agent_id(name, type)')
    .in('id', conversationIds);

  if (error) {
    console.error("Error fetching convs:", error);
  } else {
    console.log(JSON.stringify(convs, null, 2));
  }
}

debug();
