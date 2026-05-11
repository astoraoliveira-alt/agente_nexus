const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNzcwNDksImV4cCI6MjA4Njk1MzA0OX0.ALSvuPPm7QZd7rlmOMRkmBlzGE9-yjCgureTqDc2Yns';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDuplicates() {
  console.log('🔍 Verificando duplicatas na tabela "messages"...');
  
  // Buscar mensagens recentes que parecem duplicadas (mesmo conteúdo, mesma conversa, tempo próximo)
  const { data, error } = await supabase
    .from('messages')
    .select('id, content, conversation_id, created_at, external_id, sender_type')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('❌ Erro ao buscar mensagens:', error.message);
    return;
  }

  const duplicates = [];
  const seen = new Map();

  data.forEach(msg => {
    const key = `${msg.conversation_id}-${msg.content}-${msg.sender_type}`;
    if (seen.has(key)) {
      const prev = seen.get(key);
      const timeDiff = Math.abs(new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime());
      if (timeDiff < 5000) { // 5 segundos
        duplicates.push({ msg1: prev, msg2: msg, timeDiffMs: timeDiff });
      }
    }
    seen.set(key, msg);
  });

  if (duplicates.length > 0) {
    console.log(`\n❌ Encontradas ${duplicates.length} possíveis duplicatas recentes no banco:`);
    duplicates.forEach(d => {
      console.log(`- Conversa: ${d.msg1.conversation_id}`);
      console.log(`  Conteúdo: "${d.msg1.content.substring(0, 50)}..."`);
      console.log(`  Msg 1 (ID: ${d.msg1.id}) - External ID: ${d.msg1.external_id}`);
      console.log(`  Msg 2 (ID: ${d.msg2.id}) - External ID: ${d.msg2.external_id}`);
      console.log(`  Diferença de tempo: ${d.timeDiffMs}ms`);
      console.log('---');
    });
  } else {
    console.log('\n✅ Nenhuma duplicata óbvia encontrada nos últimos 100 registros do banco.');
    console.log('Se o usuário está vendo duplicado mas o banco está limpo, o problema pode ser no FRONTEND (Realtime ou State Management).');
  }

  console.log('\n🔍 Verificando se existem external_ids duplicados...');
  const { data: extData, error: extError } = await supabase
    .rpc('check_duplicate_external_ids'); // Tentando chamar uma RPC se existir

  if (extError) {
    // Se a RPC não existir, vamos fazer manual
    const externalIds = data.map(m => m.external_id).filter(id => id);
    const uniqueExtIds = new Set(externalIds);
    if (externalIds.length !== uniqueExtIds.size) {
        console.log(`⚠️ Detectamos IDs externos duplicados na amostra de 100: ${externalIds.length - uniqueExtIds.size} duplicatas.`);
    } else {
        console.log('✅ IDs externos únicos na amostra de 100.');
    }
  }
}

checkDuplicates();
