const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const t_id = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
  
  // Clean my test windows
  await supabase.from('whatsapp_billing_windows').delete().eq('tenant_id', t_id).gt('window_started_at', '2026-06-02T22:00:00Z');
  
  // Get an existing conversation
  const { data: convs } = await supabase.from('conversations').select('id, user_identifier, agent_id').eq('tenant_id', t_id).limit(1);
  
  // Call the billing function directly
  const { data, error } = await supabase.rpc('fn_process_whatsapp_billing', {
    p_tenant_id: t_id,
    p_agent_id: convs[0].agent_id,
    p_conversation_id: convs[0].id,
    p_message_id: '8cd5614b-296b-464c-bd5e-2c4981fa635b', // fake
    p_contact_phone: convs[0].user_identifier,
    p_event_time: '2026-06-02T16:18:47.463199+00:00', // The exact time of the message
    p_metadata: {
      campaign_id: 'f1f5cbb0-389c-471f-8f5e-069e31d9888b',
      reengagement_attempt_count: 1
    }
  });

  console.log('Result:', error || data);
  
  // Check if window was created
  const { data: windows } = await supabase.from('whatsapp_billing_windows').select('id, window_started_at, metadata').eq('tenant_id', t_id).eq('contact_phone', convs[0].user_identifier).order('window_started_at', { ascending: false }).limit(2);
  console.log('Latest windows:', windows);
}
run();
