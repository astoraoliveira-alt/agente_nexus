const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNzcwNDksImV4cCI6MjA4Njk1MzA0OX0.ALSvuPPm7QZd7rlmOMRkmBlzGE9-yjCgureTqDc2Yns';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkInboundQueue() {
  console.log('🔍 Verificando duplicatas na "inbound_queue"...');
  
  const { data, error } = await supabase
    .from('inbound_queue')
    .select('id, payload, created_at, trace_id, external_id')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('❌ Erro:', error.message);
    return;
  }

  const duplicates = [];
  const seen = new Map();

  data.forEach(item => {
    const content = item.payload?.content;
    const phone = item.payload?.phone;
    if (!content || !phone) return;

    const key = `${phone}-${content}`;
    if (seen.has(key)) {
      const prev = seen.get(key);
      const timeDiff = Math.abs(new Date(item.created_at).getTime() - new Date(prev.created_at).getTime());
      if (timeDiff < 5000) {
        duplicates.push({ item1: prev, item2: item, timeDiffMs: timeDiff });
      }
    }
    seen.set(key, item);
  });

  if (duplicates.length > 0) {
    console.log(`\n❌ Encontradas ${duplicates.length} possíveis duplicatas na FILA DE ENTRADA (Porteiro):`);
    duplicates.forEach(d => {
      console.log(`- Telefone: ${d.item1.payload.phone}`);
      console.log(`  Conteúdo: "${d.item1.payload.content.substring(0, 50)}..."`);
      console.log(`  Item 1 (ID: ${d.item1.id}) - External ID: ${d.item1.external_id}`);
      console.log(`  Item 2 (ID: ${d.item2.id}) - External ID: ${d.item2.external_id}`);
      console.log(`  Diferença de tempo: ${d.timeDiffMs}ms`);
      console.log('---');
    });
  } else {
    console.log('\n✅ Nenhuma duplicata óbvia na inbound_queue.');
  }
}

checkInboundQueue();
