const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(viteUrlMatch[1].trim(), serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const campaignId = 'bf607c72-4e7e-4222-a208-feb888ae3615';

async function investigateAndFix() {
  console.log('1. Verificando as 20 mensagens em processing...');
  const { data: processingRecords, error: pErr } = await supabase
    .from('outbound_queue')
    .select('id, created_at, processing_started_at')
    .eq('campaign_id', campaignId)
    .eq('status', 'processing');
    
  if (pErr) console.error(pErr);
  else {
    console.log(`Encontrados ${processingRecords.length} registros presos em processing.`);
    if (processingRecords.length > 0) {
      console.log(`Tempo de início de processamento do primeiro: ${processingRecords[0].processing_started_at}`);
      
      console.log('Voltando os processing para pending...');
      const { data: updatedP, error: uPErr } = await supabase
        .from('outbound_queue')
        .update({ status: 'pending', processing_started_at: null })
        .eq('campaign_id', campaignId)
        .eq('status', 'processing')
        .select();
        
      if (uPErr) console.error('Erro ao atualizar processing:', uPErr);
      else console.log(`Atualizados ${updatedP.length} registros para pending.`);
    }
  }

  console.log('\n2. Verificando os not_delivered...');
  const { data: notDelivered, error: nErr } = await supabase
    .from('outbound_queue')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('status', 'not_delivered');
    
  if (nErr) console.error(nErr);
  else {
    console.log(`Encontrados ${notDelivered.length} registros como not_delivered.`);
    if (notDelivered.length > 0) {
      console.log('Voltando os not_delivered para pending para reenvio...');
      const { data: updatedN, error: uNErr } = await supabase
        .from('outbound_queue')
        .update({ status: 'pending', sent_at: null })
        .eq('campaign_id', campaignId)
        .eq('status', 'not_delivered')
        .select();
        
      if (uNErr) console.error('Erro ao atualizar not_delivered:', uNErr);
      else console.log(`Atualizados ${updatedN.length} registros para pending.`);
    }
  }
}

investigateAndFix();
