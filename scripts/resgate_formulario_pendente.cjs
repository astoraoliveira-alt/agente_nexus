/**
 * DISPARO DE RESGATE DE FORMULÁRIO PENDENTE - LEADS QUE TRAVARAM NO FLOW
 * 
 * Segmentação Exclusiva:
 * - 47 leads das campanhas de 09/nov e 06/nov que clicaram no botão "Solicitar análise"
 *   ou responderam positivamente, mas travaram antes de concluir o envio do formulário.
 * 
 * Estratégia de Envio:
 * - Mensagem humanizada e objetiva da Sofia
 * - Botão nativo interativo do WhatsApp Flow [ Simular Crédito ] (1 clique para abrir e preencher)
 * - Texto com opção de responder diretamente por mensagem caso prefira
 * 
 * Rastreabilidade & Consumo:
 * - Atualiza outbound_queue e messages
 * - Registra em whatsapp_billing_windows para manter a tela de Consumo atualizada
 * 
 * Uso:
 *   node scripts/resgate_formulario_pendente.cjs --dry-run
 *   node scripts/resgate_formulario_pendente.cjs --test-batch=2
 *   node scripts/resgate_formulario_pendente.cjs --now
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const TENANT_ID = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
const CAMPAIGN_09NOV = '660ba178-ce82-48b3-8c90-647e1bad0480';
const CAMPAIGN_06NOV = '9d77d45a-1147-470f-b911-d4679417b9e3';

const ZENVIA_TOKEN = 'mJZ-6UC5zhffeBjG69b3tM93gv47QbJOfvK0';
const ZENVIA_CHANNEL = '551151183815';
const FLOW_ID = '1135459742362876';

// CLI args
const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');
const IS_NOW = args.includes('--now');
const TEST_BATCH_ARG = args.find(a => a.startsWith('--test-batch='));
const TEST_BATCH_LIMIT = TEST_BATCH_ARG ? parseInt(TEST_BATCH_ARG.split('=')[1], 10) : 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractFirstName(rawName) {
  if (!rawName) return '';
  const cleaned = String(rawName)
    .replace(/^[0-9.\-\/\s]+/, '')
    .replace(/\b(LTDA|ME|EIRELI|S\/A|SA|EPP|COMERCIO|DE|ALIMENTOS|RESTAURANTE|MERCADO|SUPERMERCADO|PADARIA|LANCHONETE|PIZZARIA|MINIMERCADO|MERCEARIA|ACOUGUE|EMPORIO|DISTRIBUIDORA)\b/gi, '')
    .trim();
  const first = cleaned.split(/\s+/)[0];
  if (!first || first.length < 2) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

async function sendZenviaFlowMessage(toPhone, firstName) {
  if (IS_DRY_RUN) {
    return { ok: true, status: 200, data: { dry_run: true } };
  }

  const saudacaoNome = firstName ? `, ${firstName}` : '';
  const bodyText = `Olá${saudacaoNome}! Vi que você iniciou sua solicitação de crédito Ticket, mas faltou concluir a simulação.\n\nClique no botão abaixo para preencher rapidinho ou me informe por aqui o valor desejado para sua empresa:`;

  const zenviaUrl = 'https://api.zenvia.com/v2/channels/whatsapp/messages';
  const payload = {
    from: ZENVIA_CHANNEL,
    to: toPhone,
    contents: [
      {
        type: 'flow',
        header: 'Reforço de Caixa Ticket',
        body: bodyText,
        footer: 'Parceria Ticket & Fiserv',
        flow: {
          mode: 'published',
          token: `resgate_${Date.now()}`,
          id: FLOW_ID,
          buttonText: 'Simular Crédito',
          action: {
            type: 'navigate',
            screen: 'SIMULACAO_SCREEN'
          }
        }
      }
    ]
  };

  try {
    const res = await fetch(zenviaUrl, {
      method: 'POST',
      headers: {
        'X-API-TOKEN': ZENVIA_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      json = { raw: text };
    }

    return {
      ok: res.ok,
      status: res.status,
      data: json,
      bodyText
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err.message,
      bodyText
    };
  }
}

async function getStuckLeads() {
  console.log(`🔍 Mapeando leads que clicaram no botão mas travaram no formulário...`);

  const { data: queue, error: qErr } = await supabase
    .from('outbound_queue')
    .select('id, contact_phone, contact_name, conversation_id, campaign_id, agent_id, metadata, reengagement_attempt_count')
    .in('campaign_id', [CAMPAIGN_09NOV, CAMPAIGN_06NOV])
    .eq('response_detected', true);

  if (qErr) throw new Error(qErr.message);

  const stuck = [];

  for (const q of queue) {
    if (!q.conversation_id) continue;
    const { data: msgs } = await supabase
      .from('messages')
      .select('content, direction, created_at')
      .eq('conversation_id', q.conversation_id)
      .order('created_at', { ascending: true });

    if (!msgs || msgs.length <= 1) continue;

    const inbounds = msgs.filter(m => m.direction === 'inbound');
    const allText = inbounds.map(m => m.content || '').join(' ').toLowerCase();

    const clicked = allText.includes('solicitar análise') || allText.includes('quero simular') || allText.includes('simular crédito');
    const completed = allText.includes('formulário de simulação') || allText.includes('valor desejado:');

    // Se já concluiu o form, não entra no resgate
    if (completed) continue;

    if (clicked) {
      stuck.push({
        queueId: q.id,
        phone: q.contact_phone,
        name: q.contact_name,
        conversationId: q.conversation_id,
        campaignId: q.campaign_id,
        agentId: q.agent_id || '0290cece-beef-4b3b-84c6-bf4d53851a96',
        attemptCount: q.reengagement_attempt_count || 0
      });
    }
  }

  return stuck;
}

async function runRecovery() {
  const allStuck = await getStuckLeads();
  let targets = allStuck;

  console.log(`\n=============================================================`);
  console.log(`🎯 AUDITORIA DO LOTE DE RESGATE:`);
  console.log(`   - Total de leads travados pós-clique: ${allStuck.length} leads`);
  console.log(`=============================================================\n`);

  if (TEST_BATCH_LIMIT > 0) {
    targets = allStuck.slice(0, TEST_BATCH_LIMIT);
    console.log(`⚠️ MODO DE TESTE ATIVO: Disparando apenas para os primeiros ${TEST_BATCH_LIMIT} leads.\n`);
  } else if (!IS_NOW && !IS_DRY_RUN) {
    console.log(`
Uso do script:
  node scripts/resgate_formulario_pendente.cjs --dry-run          # Simula o envio
  node scripts/resgate_formulario_pendente.cjs --test-batch=2    # Envia para 2 leads de teste
  node scripts/resgate_formulario_pendente.cjs --now             # Dispara para TODOS os ${allStuck.length} leads
`);
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    const firstName = extractFirstName(item.name);

    const res = await sendZenviaFlowMessage(item.phone, firstName);
    const nowIso = new Date().toISOString();

    if (res.ok) {
      successCount++;
      if (!IS_DRY_RUN) {
        // 1. Atualizar histórico da conversa para o operador
        await supabase.from('messages').insert({
          conversation_id: item.conversationId,
          tenant_id: TENANT_ID,
          content: res.bodyText,
          sender_type: 'ai',
          sender_name: 'Sofia',
          direction: 'outbound',
          message_type: 'flow',
          status: 'SENT',
          created_at: nowIso
        });

        // 2. Atualizar fila
        await supabase.from('outbound_queue').update({
          reengagement_attempt_count: item.attemptCount + 1,
          reengagement_last_sent_at: nowIso,
          last_attempt_at: nowIso
        }).eq('id', item.queueId);

        // 3. Registrar consumo
        const expIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await supabase
          .from('whatsapp_billing_windows')
          .update({ status: 'closed' })
          .eq('tenant_id', TENANT_ID)
          .eq('contact_phone', item.phone)
          .eq('status', 'open');

        await supabase.from('whatsapp_billing_windows').insert({
          tenant_id: TENANT_ID,
          agent_id: item.agentId,
          conversation_id: item.conversationId,
          outbound_queue_id: item.queueId,
          contact_phone: item.phone,
          provider: 'zenvia',
          billing_mode: 'window_24h',
          status: 'open',
          window_started_at: nowIso,
          window_expires_at: expIso,
          last_activity_at: nowIso,
          metadata: {
            campaign_id: item.campaignId,
            reengagement_attempt_count: item.attemptCount + 1,
            source: 'resgate_flow_pendente'
          }
        });
      }
    } else {
      failCount++;
      console.log(`  ❌ Falha [${i + 1}/${targets.length}] ${item.phone}: HTTP ${res.status}`);
    }

    if ((i + 1) % 10 === 0 || i === targets.length - 1) {
      console.log(`  Progresso [${i + 1}/${targets.length}] Sucessos: ${successCount} | Falhas: ${failCount}`);
    }

    await sleep(IS_DRY_RUN ? 0 : 400);
  }

  console.log(`\n=============================================================`);
  console.log(`🎉 RESGATE CONCLUÍDO!`);
  console.log(`   - Enviados com sucesso: ${successCount}/${targets.length}`);
  console.log(`   - Falhas: ${failCount}`);
  console.log(`=============================================================\n`);
}

runRecovery().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
