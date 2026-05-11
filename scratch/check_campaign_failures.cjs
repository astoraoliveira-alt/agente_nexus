const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNzcwNDksImV4cCI6MjA4Njk1MzA0OX0.ALSvuPPm7QZd7rlmOMRkmBlzGE9-yjCgureTqDc2Yns';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCampaign() {
  console.log('🔐 Tentando login com credenciais de demonstração...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'carlos@davos.ai',
    password: 'admin123'
  });

  if (authError) {
    console.error('❌ Erro de autenticação:', authError.message);
    return;
  }

  console.log('✅ Autenticado com sucesso como:', authData.user.email);

  console.log('🔍 Buscando campanha: "Carga teste 07/mai"...');
  const { data: campaigns, error: campError } = await supabase
    .from('campaigns')
    .select('*')
    .ilike('name', '%Carga teste 07/mai%');

  if (campError || !campaigns || campaigns.length === 0) {
    console.error('❌ Campanha não encontrada:', campError?.message || 'Sem resultados (RLS?)');
    return;
  }

  const campaign = campaigns[0];
  console.log(`✅ Campanha encontrada: ${campaign.name} (ID: ${campaign.id})`);
  
  console.log('\n📦 Analisando outbound_queue...');
  const { data: queue, error: queueError } = await supabase
    .from('outbound_queue')
    .select('status, contact_phone, error_message, last_attempt_at')
    .eq('campaign_id', campaign.id);

  if (queueError) {
    console.error('❌ Erro ao buscar fila:', queueError.message);
    return;
  }

  const stats = queue.reduce((acc, curr) => {
    acc[curr.status] = (acc[curr.status] || 0) + 1;
    return acc;
  }, {});

  console.log('📈 Estatísticas da Fila:', stats);

  const failures = queue.filter((item) => item.status === 'failed' || item.error_message);
  
  if (failures.length > 0) {
    console.log(`\n❌ Encontradas ${failures.length} falhas explícitas na fila:`);
    failures.slice(0, 10).forEach((f) => {
      console.log(`- ${f.contact_phone}: ${f.error_message || 'Erro no provedor (Rejected/Invalid)'} (Status: ${f.status})`);
    });
  } else {
    console.log('\n✅ Nenhuma falha com status="failed" na fila.');
  }

  console.log('\n📊 Resumo técnico:');
  console.log(`- Total na fila: ${queue.length}`);
  console.log(`- Status 'sent': ${stats.sent || 0}`);
  console.log(`- Gap de 26: Provavelmente falta de confirmação de entrega (offline ou número sem WhatsApp).`);
}

checkCampaign();
