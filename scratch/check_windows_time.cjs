const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const { data: windows } = await supabase
    .from('whatsapp_billing_windows')
    .select('id, window_started_at, contact_phone, metadata')
    .eq('tenant_id', 'd290f1ee-6c54-4b01-90e6-d701748f0851')
    .gt('window_started_at', '2026-06-02T16:00:00Z')
    .lt('window_started_at', '2026-06-02T16:30:00Z');

  console.log(`Found ${windows.length} windows between 16:00 and 16:30.`);
  if (windows.length > 0) {
    console.log('Sample window:', windows[0]);
  }
}
run();
