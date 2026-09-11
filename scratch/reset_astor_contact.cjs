const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const phone = '5511993434871';
  const targetId = 'a8424d9b-41a7-49b6-826e-eebfa61d8da9';
  
  const tables = [
    'agent_leads', 'contacts', 'campaign_contacts', 'leads', 'outbound_queue'
  ];
  
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('id, metadata, status').or(`id.eq.${targetId},whatsapp.eq.${phone},phone.eq.${phone}`).limit(5);
    if (data && data.length > 0) {
      console.log(`✅ Found ${data.length} record(s) in table: ${table}`);
      
      for (const row of data) {
        if (row.id === targetId || table === 'agent_leads' || table === 'contacts') {
          console.log(`Resetting row ${row.id} in ${table}...`);
          const newMeta = row.metadata ? { ...row.metadata } : {};
          delete newMeta.consent;
          delete newMeta.fiserv_offer_sent;
          delete newMeta.fiserv_status;
          delete newMeta.loan_request_id;
          delete newMeta.fiserv_offer_data;
          delete newMeta.fiserv_amount_approved;
          delete newMeta.fiserv_external_status;
          
          const { data: updated, error: updErr } = await supabase
            .from(table)
            .update({ 
              metadata: newMeta,
              status: 'pending' 
            })
            .eq('id', row.id)
            .select();
            
          if (updErr) {
            console.error('Error updating:', updErr);
          } else {
            console.log(`✅ Successfully reset ${table} ID ${row.id}`);
          }
        }
      }
    } else if (error) {
      // ignore table not found or column missing errors
    }
  }
}

run();
