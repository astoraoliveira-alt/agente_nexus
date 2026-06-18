const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(viteUrlMatch[1].trim(), serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const campaignId = 'bf607c72-4e7e-4222-a208-feb888ae3615';

async function fixProcessing() {
  console.log('Voltando os processing para pending...');
  const { data: updatedP, error: uPErr } = await supabase
    .from('outbound_queue')
    .update({ status: 'pending', sent_at: null })
    .eq('campaign_id', campaignId)
    .eq('status', 'processing')
    .select();
    
  if (uPErr) console.error('Erro ao atualizar processing:', uPErr);
  else console.log(`Atualizados ${updatedP.length} registros (processing -> pending).`);
}

fixProcessing();
