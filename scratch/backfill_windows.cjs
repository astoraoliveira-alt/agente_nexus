const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const t_id = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
  const c_id = 'f1f5cbb0-389c-471f-8f5e-069e31d9888b';
  
  // Get messages from today that have this campaign
  const { data: targetMessages, error } = await supabase
    .from('messages')
    .select('id, created_at, metadata, conversation_id')
    .eq('tenant_id', t_id)
    .gt('created_at', '2026-06-02T00:00:00Z')
    .contains('metadata', { campaign_id: c_id });
    
  if (error) {
    console.log('Error', error);
    return;
  }
    
  console.log(`Found ${targetMessages.length} messages to backfill.`);
  
  let successCount = 0;
  for (const m of targetMessages) {
    const { data: conv } = await supabase.from('conversations').select('agent_id, user_identifier').eq('id', m.conversation_id).single();
    if (!conv) continue;
    
    const attemptCount = m.metadata.reengagement_loop || m.metadata.reengagement_attempt_count || 1;
    
    const { error: rpcError } = await supabase.rpc('fn_process_whatsapp_billing', {
      p_tenant_id: t_id,
      p_agent_id: conv.agent_id,
      p_conversation_id: m.conversation_id,
      p_message_id: m.id,
      p_contact_phone: conv.user_identifier,
      p_event_time: m.created_at,
      p_metadata: {
        campaign_id: c_id,
        reengagement_attempt_count: attemptCount,
        trigger_origin: 'backfill_script'
      }
    });
    
    if (rpcError) {
      console.log('Error processing message', m.id, rpcError);
    } else {
      successCount++;
    }
  }
  
  console.log(`Successfully processed ${successCount} messages.`);
}
run();
