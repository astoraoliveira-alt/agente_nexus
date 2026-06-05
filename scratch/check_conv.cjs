const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const { data: messages } = await supabase
    .from('messages')
    .select('conversation_id')
    .eq('tenant_id', 'd290f1ee-6c54-4b01-90e6-d701748f0851')
    .contains('metadata', { campaign_id: 'f1f5cbb0-389c-471f-8f5e-069e31d9888b' })
    .gt('created_at', '2026-06-02T16:00:00Z')
    .limit(1);

  if (messages.length > 0) {
    const { data: conv } = await supabase.from('conversations').select('*').eq('id', messages[0].conversation_id);
    console.log('Conversation:', conv);
  } else {
    console.log('No messages found');
  }
}
run();
