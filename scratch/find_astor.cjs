const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const targetId = 'a8424d9b-41a7-49b6-826e-eebfa61d8da9';
  
  const tables = [
    'agent_leads', 'contacts', 'campaign_contacts', 'leads', 'outbound_queue',
    'conversations', 'messages', 'evaluations', 'campaigns', 'campaign_import_logs',
    'campaign_recovery_logs', 'users', 'company_davos_costs', 'plans', 'incidents'
  ];
  
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('id').eq('id', targetId);
    if (data && data.length > 0) {
      console.log(`🎯 FOUND IN TABLE: ${table}`);
      
      // Let's get the full row
      const { data: fullData } = await supabase.from(table).select('*').eq('id', targetId);
      console.log('Full Row:', JSON.stringify(fullData[0], null, 2));
      
      // Reset
      const row = fullData[0];
      if (row.metadata) {
        const newMeta = { ...row.metadata };
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
          .eq('id', targetId)
          .select();
          
        if (updErr) {
          console.error('Update Error:', updErr);
        } else {
          console.log(`✅ SUCCESS! Reset metadata on table ${table}`);
        }
      }
      return;
    } else if (error) {
      // console.log(`Error checking table ${table}:`, error.message);
    }
  }
  console.log('Not found by ID.');
}

run();
