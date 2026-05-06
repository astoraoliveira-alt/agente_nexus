import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(url, serviceRole);

async function inspectRPCInbound() {
    const convId = 'f907c1a3-6804-4850-a19c-371a36a456bb';
    console.log(`Searching for inbound queue context for conversation: ${convId}`);
    
    const { data: queueItems, error } = await supabase
        .from('inbound_queue')
        .select('id, created_at, status, context')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: false })
        .limit(1);
        
    if (error) {
        console.error("Error fetching inbound_queue:", error);
        return;
    }
    
    if (!queueItems || queueItems.length === 0) {
        console.log("No queue items found for this conversation.");
        return;
    }
    
    const item = queueItems[0];
    console.log(`\n--- Queue Item ID: ${item.id} ---`);
    console.log(`Created At: ${item.created_at}`);
    console.log(`Status: ${item.status}`);
    console.log(`\n--- RPC Context Output (Lead Info & History) ---`);
    console.log(JSON.stringify(item.context, null, 2));
}

inspectRPCInbound();
