import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase credentials not found.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCampaign() {
  console.log('🔍 Buscando campanha: "Carga teste 07/mai"...');
  
  const { data: campaigns, error: campError } = await supabase
    .from('campaigns')
    .select('*')
    .ilike('name', '%Carga teste 07/mai%');

  if (campError || !campaigns || campaigns.length === 0) {
    console.error('❌ Campanha não encontrada:', campError?.message);
    return;
  }

  const campaign = campaigns[0];
  console.log(`✅ Campanha encontrada: ${campaign.name} (ID: ${campaign.id})`);
  console.log(`📊 Dashboard: Válidos: ${campaign.total_contacts}, Enviados: ${campaign.sent_count}, Respostas: ${campaign.response_count}`);

  console.log('\n📦 Analisando outbound_queue...');
  const { data: queue, error: queueError } = await supabase
    .from('outbound_queue')
    .select('status, contact_phone, error_message, last_attempt_at')
    .eq('campaign_id', campaign.id);

  if (queueError) {
    console.error('❌ Erro ao buscar fila:', queueError.message);
    return;
  }

  const stats = queue.reduce((acc: any, curr: any) => {
    acc[curr.status] = (acc[curr.status] || 0) + 1;
    return acc;
  }, {});

  console.log('📈 Estatísticas da Fila:', stats);

  const failures = queue.filter((item: any) => item.status === 'failed' || item.error_message);
  
  if (failures.length > 0) {
    console.log(`\n❌ Encontradas ${failures.length} falhas:`);
    failures.slice(0, 10).forEach((f: any) => {
      console.log(`- ${f.contact_phone}: ${f.error_message || 'Sem mensagem de erro'} (Status: ${f.status})`);
    });
    if (failures.length > 10) console.log('... e mais.');
  } else {
    console.log('\n✅ Nenhuma falha explícita (status="failed") encontrada na fila.');
  }

  // Check Delivered status (which might be in another table or field depending on implementation)
  // Usually "Delivered" is tracked via webhooks update.
  
  console.log('\n🔍 Verificando logs de integração para erros do provedor...');
  const { data: logs, error: logsError } = await supabase
    .from('integration_logs')
    .select('payload, created_at')
    .ilike('payload::text', `%${campaign.id}%`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (logsError) {
    console.warn('⚠️ Erro ao buscar logs:', logsError.message);
  } else if (logs && logs.length > 0) {
    console.log(`✅ Encontrados ${logs.length} logs recentes relacionados à campanha.`);
    const errorLogs = logs.filter(l => JSON.stringify(l.payload).toLowerCase().includes('error') || JSON.stringify(l.payload).toLowerCase().includes('fail'));
    if (errorLogs.length > 0) {
      console.log(`❌ Encontrados ${errorLogs.length} logs com erros:`);
      errorLogs.slice(0, 5).forEach(l => console.log(JSON.stringify(l.payload, null, 2)));
    }
  }

  console.log('\n💡 Nota: Se "Enviados" = 99 mas "Entregues" = 73, os 26 restantes provavelmente:');
  console.log('1. São números sem WhatsApp (o provedor enviou mas não entregou).');
  console.log('2. Estão com status pendente de recebimento pelo celular do cliente (offline).');
  console.log('3. Foram bloqueados pelo WhatsApp (Spam detection).');
}

checkCampaign();
