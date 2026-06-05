const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const t_id = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
  // Get an existing conversation
  const { data: convs } = await supabase.from('conversations').select('id, user_identifier').eq('tenant_id', t_id).limit(1);
  const c_id = convs[0].id;
  const user_phone = convs[0].user_identifier;

  // Insert a test message
  const { data: msg, error } = await supabase.from('messages').insert({
    tenant_id: t_id,
    conversation_id: c_id,
    direction: 'outbound',
    message_type: 'text',
    sender_type: 'system',
    content: 'test window creation 2',
    status: 'sent',
    metadata: {
      campaign_id: 'f1f5cbb0-389c-471f-8f5e-069e31d9888b',
      test: true
    }
  }).select('*').single();

  if (error) {
    console.log('Error inserting msg:', error);
    return;
  }
  console.log('Inserted message:', msg.id);

  // Wait 1 second
  await new Promise(r => setTimeout(r, 1000));

  // Check windows
  const { data: windows } = await supabase.from('whatsapp_billing_windows').select('id, window_started_at, metadata').eq('tenant_id', t_id).eq('contact_phone', user_phone).order('window_started_at', { ascending: false }).limit(2);
  console.log('Latest windows for phone:', windows);
}
run();
