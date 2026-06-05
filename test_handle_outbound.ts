import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// Carrega as variáveis de ambiente
const envFile = fs.readFileSync('.env.local', 'utf8');
const env: Record<string, string> = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1]] = match[2];
  }
});

// Inicializa o cliente do Supabase
const supabase = createClient(env['VITE_SUPABASE_URL'], env['VITE_SUPABASE_ANON_KEY']);

async function testFix() {
  console.log("🚀 Testando a function handle_outbound_sent com conteúdo vazio...");

  // Usamos os IDs reais que vimos no banco para simular o worker
  const queueId = '2474c6a8-e5b6-4112-adbf-bb650418b7ae'; // ID da fila que foi reengajamento
  const campaignId = 'a3a9ec7e-af4d-40a2-ba22-a2d1e189981d'; // ID da campanha
  const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
  const agentId = '0e5a2927-1617-48a7-9e54-0834ddbbc924';

  const { data: rpcData, error: rpcError } = await supabase.rpc('handle_outbound_sent', {
    p_tenant_id: tenantId,
    p_agent_id: agentId,
    p_contact_phone: '5511999999999', // Telefone de teste
    p_contact_name: 'Teste de Validação',
    p_message_content: '', // SIMULANDO O BUG DO TEMPLATE VAZIO
    p_queue_id: queueId,
    p_campaign_id: campaignId,
    p_trace_id: 'teste-reengajamento-123'
  });

  if (rpcError) {
    console.error("❌ Erro ao executar a function:", rpcError);
    return;
  }

  console.log("✅ Function executada com sucesso! Retorno:", rpcData);

  // Agora vamos verificar no banco como a mensagem foi salva
  const { data: msgData, error: msgError } = await supabase
    .from('messages')
    .select('id, content, sender_type')
    .eq('id', rpcData.message_id)
    .single();

  if (msgError) {
    console.error("❌ Erro ao buscar a mensagem:", msgError);
    return;
  }

  console.log("\n📦 Resultado no Banco de Dados:");
  console.log("ID da Mensagem:", msgData.id);
  console.log("Remetente:", msgData.sender_type);
  console.log("Conteúdo Salvo:", msgData.content === '' ? '⚠️ VAZIO (Bug persistindo)' : `✅ "${msgData.content}"`);
  
  if (msgData.content !== '') {
    console.log("\n🎉 SUCESSO! A function pegou a mensagem corretamente pelo Fallback!");
  }
}

testFix();
