const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);
const campaignId = 'fb8348df-5c26-42bb-a3a0-592cef3361b7'; // Carga teste 27/mai

async function run() {
  console.log('Testing direct UPDATE on outbound_queue...');
  
  // Try to update 1 pending lead to 'processing'
  const { data, error } = await supabase
    .from('outbound_queue')
    .update({ status: 'processing' })
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .limit(1)
    .select('id, status');

  if (error) {
    console.error('Update Error:', error);
  } else {
    console.log('Update success! Updated rows:', data);
    
    // Restore it back to pending
    if (data && data.length > 0) {
      console.log('Restoring status back to pending...');
      const { error: errRestore } = await supabase
        .from('outbound_queue')
        .update({ status: 'pending' })
        .eq('id', data[0].id);
      
      if (errRestore) {
        console.error('Restore Error:', errRestore);
      } else {
        console.log('Restored successfully.');
      }
    }
  }
}

run();
