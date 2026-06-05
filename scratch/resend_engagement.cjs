const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);
const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851'; // tenant_id para esta conta

async function resendEngagement() {
  console.log('Buscando a campanha "Disparo 01.06"...');
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('id, name')
    .ilike('name', '%Disparo 01.06%')
    .eq('tenant_id', tenantId)
    .single();

  if (error || !campaign) {
    console.error('Erro ao buscar campanha:', error);
    return;
  }
  
  console.log(`Campanha encontrada: ${campaign.name} (${campaign.id})`);

  // Buscamos os leads que não tiveram resposta detectada e que não estão convertidos/rejeitados
  // Aqui estamos selecionando leads com status: read, delivered, sent (e opcionalmente not_delivered)
  const { data: queueData, error: qError } = await supabase
    .from('outbound_queue')
    .select('id, status, response_detected')
    .eq('campaign_id', campaign.id)
    .eq('response_detected', false)
    .in('status', ['read', 'delivered', 'sent', 'not_delivered']); 
    // Pode remover 'not_delivered' se não quiser reenviar para os que falharam da primeira vez.

  if (qError) {
    console.error('Erro ao buscar fila:', qError);
    return;
  }

  console.log(`Encontrados ${queueData.length} leads sem engajamento que podem ser reenviados.`);

  if (queueData.length === 0) {
    console.log('Nenhum lead para reenviar.');
    return;
  }

  const idsToUpdate = queueData.map(item => item.id);

  console.log('Atualizando os leads para status "pending"...');

  const { data: updateData, error: updateError } = await supabase
    .from('outbound_queue')
    .update({ 
      status: 'pending', 
      retry_count: 0,
      error_message: null,
      scheduled_at: new Date().toISOString()
    })
    .in('id', idsToUpdate);

  if (updateError) {
    console.error('Erro ao atualizar fila:', updateError);
  } else {
    console.log(`Sucesso! ${idsToUpdate.length} leads foram colocados novamente na fila para envio.`);
  }
}

resendEngagement();
