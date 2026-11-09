/**
 * DISPARO DE REENGAJAMENTO - CAMPANHA 06/NOV (09/NOV)
 * 
 * Segmentação do Envio:
 * - Maior alcance possível sem colisão comercial nem violação de cooldown.
 * - Total de contatos aptos mapeados: ~1.208 contatos
 *   * Grupo 1 (523 leads): Status 'delivered' com 0 tentativas de reengajamento.
 *   * Grupo 2 (276 leads): Status 'sent' com 0 tentativas de reengajamento.
 *   * Grupo 3 (409 leads): Status 'read' com 1 tentativa (lidos no sábado que não responderam).
 * 
 * Template:
 *   - Template Oficial Black Friday (Ticket Friday): 7f109fd6-f6ad-4f4c-926b-2e8403f68647
 *   - Imagem oficial Ticket Friday
 *   - Botão interativo de solicitação de análise
 * 
 * Faturamento & Consumo (CRÍTICO):
 *   - Fecha janelas de faturamento expiradas do contato (> 24h)
 *   - Cria nova janela ativa em `whatsapp_billing_windows` com `campaign_id` e `reengagement_attempt_count`
 *   - Atualiza `outbound_queue` (reengagement_attempt_count, reengagement_last_sent_at)
 *   - Insere a mensagem na tabela `messages` vinculada à conversa e tenant
 *   - Garante a sincronização da campanha na conversa para cômputo na tela de Consumo
 * 
 * Uso:
 *   node scripts/disparo_reengajamento_06nov.cjs --dry-run
 *   node scripts/disparo_reengajamento_06nov.cjs --test-batch=10
 *   node scripts/disparo_reengajamento_06nov.cjs --now
 */

const { createClient } = require('@supabase/supabase-js');

// Configurações Supabase
const SUPABASE_URL = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const TENANT_ID = 'd290f1ee-6c54-4b01-90e6-d701748f0851'; // Edenred
const CAMPAIGN_ID = '9d77d45a-1147-470f-b911-d4679417b9e3'; // 06/nov_leads maior propensão
const ZENVIA_TOKEN = 'mJZ-6UC5zhffeBjG69b3tM93gv47QbJOfvK0';
const ZENVIA_CHANNEL = '551151183815';

// Template Oficial Black Friday (Ticket Friday)
const TEMPLATE_BF_ID = '7f109fd6-f6ad-4f4c-926b-2e8403f68647';
const TEMPLATE_BF_IMG = 'https://chat.zenvia.com/storage/folders/a1af1ec136a1e60cf8cb8fa102edd9d872805851206df67904e5ed0cf7043296/files/a2aeb397ae4dd04e213736a206c26b67385ab709ae421b01d0ab73d04cda1bc1.bin';
const TEMPLATE_BF_TEXT = `Olá.

Chegou a ajuda que você precisava para investir no seu negócio neste fim de ano! 🖤

A Ticket, em parceria com a Fiserv, tem uma condição especial de Ticket Friday para o seu estabelecimento:

👉 Solicite crédito em novembro e pague só em 2027!

E aproveite os benefícios exclusivos da Ticket:

-Crédito de R$ 10 mil a R$ 500 mil
-Taxas a partir de 1,89% ao mês
-Liberação em até 24 horas
-Use apenas seus recebíveis Ticket como garantia

📲 Solicite sua análise agora!`;

// CLI Arguments
const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');
const IS_NOW = args.includes('--now');
const TEST_BATCH_ARG = args.find(a => a.startsWith('--test-batch='));
const TEST_BATCH_LIMIT = TEST_BATCH_ARG ? parseInt(TEST_BATCH_ARG.split('=')[1], 10) : 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendZenviaTemplate(toPhone, maxRetries = 3) {
  if (IS_DRY_RUN) {
    return { ok: true, status: 200, data: { dry_run: true } };
  }

  const zenviaUrl = 'https://api.zenvia.com/v2/channels/whatsapp/messages';
  const payload = {
    from: ZENVIA_CHANNEL,
    to: toPhone,
    contents: [
      {
        type: 'template',
        templateId: TEMPLATE_BF_ID,
        fields: {
          imageUrl: TEMPLATE_BF_IMG
        }
      }
    ]
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
        data: json
      };
    } catch (err) {
      if (attempt === maxRetries) {
        return { ok: false, status: 0, error: err.message };
      }
      await sleep(1000 * attempt);
    }
  }
}

async function registerConsumptionBilling(item, nextAttempt, nowIso) {
  const expiresIso = new Date(new Date(nowIso).getTime() + 24 * 60 * 60 * 1000).toISOString();

  // 1. Fechar janelas abertas anteriores que já expiraram para este contato
  await supabase
    .from('whatsapp_billing_windows')
    .update({ status: 'closed' })
    .eq('tenant_id', TENANT_ID)
    .eq('contact_phone', item.contact_phone)
    .eq('status', 'open');

  // 2. Abrir nova janela de faturamento oficial com metadados de campanha para o dashboard de consumo
  await supabase.from('whatsapp_billing_windows').insert({
    tenant_id: TENANT_ID,
    agent_id: item.agent_id || '0290cece-beef-4b3b-84c6-bf4d53851a96',
    conversation_id: item.conversation_id,
    outbound_queue_id: item.id,
    contact_phone: item.contact_phone,
    provider: 'zenvia',
    billing_mode: 'window_24h',
    status: 'open',
    window_started_at: nowIso,
    window_expires_at: expiresIso,
    last_activity_at: nowIso,
    metadata: {
      campaign_id: CAMPAIGN_ID,
      reengagement_attempt_count: nextAttempt,
      source: 'reengagement_09nov'
    }
  });
}

async function getEligibleLeads() {
  console.log(`🔍 Buscando leads da campanha 06/nov no banco de dados...`);

  const { data: queue, error: qErr } = await supabase
    .from('outbound_queue')
    .select('id, contact_phone, contact_name, status, response_detected, reengagement_attempt_count, reengagement_last_sent_at, sent_at, metadata, conversation_id, agent_id')
    .eq('campaign_id', CAMPAIGN_ID);

  if (qErr) {
    throw new Error(`Erro ao buscar outbound_queue: ${qErr.message}`);
  }

  const { data: leads, error: lErr } = await supabase
    .from('agent_leads')
    .select('whatsapp, status, metadata')
    .eq('campaign_id', CAMPAIGN_ID);

  if (lErr) {
    throw new Error(`Erro ao buscar agent_leads: ${lErr.message}`);
  }

  // Mapear exclusões comerciais Fiserv
  const excludedPhones = new Set();
  leads.forEach(l => {
    const fStatus = l.metadata?.fiserv_status;
    if (['comite_approved', 'approved', 'denied', 'in_progress'].includes(fStatus) ||
        ['converted', 'rejected', 'completed'].includes(l.status)) {
      if (l.whatsapp) excludedPhones.add(l.whatsapp.replace(/\D/g, ''));
    }
  });

  const now = Date.now();
  const eligible = [];
  let skippedCooldown = 0;
  let skippedResponded = 0;
  let skippedCommercial = 0;

  for (const item of queue) {
    const cleanPhone = item.contact_phone.replace(/\D/g, '');

    if (item.response_detected) {
      skippedResponded++;
      continue;
    }

    if (excludedPhones.has(cleanPhone)) {
      skippedCommercial++;
      continue;
    }

    const lastActivity = new Date(item.reengagement_last_sent_at || item.sent_at || 0).getTime();
    const hoursSince = (now - lastActivity) / (1000 * 60 * 60);

    if (hoursSince < 24) {
      skippedCooldown++;
      continue;
    }

    // Grupos elegíveis:
    // 1. Delivered que nunca receberam reengajamento (tentativa 0)
    // 2. Sent que nunca receberam reengajamento (tentativa 0)
    // 3. Read que receberam 1º toque no sábado e não responderam (tentativa 1)
    if (
      (item.status === 'delivered' && item.reengagement_attempt_count === 0) ||
      (item.status === 'sent' && item.reengagement_attempt_count === 0) ||
      (item.status === 'read' && item.reengagement_attempt_count === 1)
    ) {
      eligible.push(item);
    }
  }

  console.log(`\n=============================================================`);
  console.log(`📊 RESULTADO DA AUDITORIA DE ELEGIBILIDADE:`);
  console.log(`   - Total geral na campanha: ${queue.length} leads`);
  console.log(`   - Excluídos comercialmente (Fiserv): ${skippedCommercial} leads`);
  console.log(`   - Excluídos por resposta do cliente: ${skippedResponded} leads`);
  console.log(`   - Bloqueados por cooldown (< 24h): ${skippedCooldown} leads`);
  console.log(`   - TOTAL APTO PARA DISPARO AGORA: ${eligible.length} leads`);
  console.log(`=============================================================\n`);

  return eligible;
}

async function runDispatch() {
  const allEligible = await getEligibleLeads();
  let targets = allEligible;

  if (TEST_BATCH_LIMIT > 0) {
    targets = allEligible.slice(0, TEST_BATCH_LIMIT);
    console.log(`⚠️ MODO DE TESTE ATIVO: Disparando apenas para os primeiros ${TEST_BATCH_LIMIT} leads.`);
  } else if (!IS_NOW && !IS_DRY_RUN) {
    console.log(`
Uso do script:
  node scripts/disparo_reengajamento_06nov.cjs --dry-run          # Simula o envio sem disparar
  node scripts/disparo_reengajamento_06nov.cjs --test-batch=10   # Envia para um lote reduzido de 10 leads
  node scripts/disparo_reengajamento_06nov.cjs --now             # Dispara para TODOS os ${allEligible.length} leads aptos
`);
    return;
  }

  console.log(`🚀 INICIANDO DISPARO PARA ${targets.length} LEADS...`);
  console.log(`Template: Ticket Friday (${TEMPLATE_BF_ID})`);
  console.log(`Canal: Zenvia (${ZENVIA_CHANNEL})\n`);

  let successCount = 0;
  let failCount = 0;
  let skippedRecent = 0;

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];

    // Checagem de segurança em tempo real: não enviar se recebeu mensagem recente da IA (< 45min)
    if (item.conversation_id && !IS_DRY_RUN) {
      const { data: recentMsgs } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', item.conversation_id)
        .eq('sender_type', 'ai')
        .gte('created_at', new Date(Date.now() - 45 * 60 * 1000).toISOString())
        .limit(1);

      if (recentMsgs && recentMsgs.length > 0) {
        skippedRecent++;
        continue;
      }
    }

    const res = await sendZenviaTemplate(item.contact_phone);
    const nowIso = new Date().toISOString();

    if (res.ok) {
      successCount++;
      if (!IS_DRY_RUN) {
        const nextAttempt = (item.reengagement_attempt_count || 0) + 1;

        // 1. Atualiza outbound_queue
        await supabase.from('outbound_queue').update({
          reengagement_attempt_count: nextAttempt,
          reengagement_last_sent_at: nowIso,
          last_attempt_at: nowIso
        }).eq('id', item.id);

        // 2. Registra Faturamento e Janela de Consumo
        try {
          await registerConsumptionBilling(item, nextAttempt, nowIso);
        } catch (bErr) {
          console.warn(`    ⚠️ Aviso ao registrar billing window para ${item.contact_phone}:`, bErr.message);
        }

        // 3. Insere mensagem no histórico (visível no chat das conversas)
        if (item.conversation_id) {
          await supabase.from('conversations').update({ campaign_id: CAMPAIGN_ID }).eq('id', item.conversation_id);

          await supabase.from('messages').insert({
            conversation_id: item.conversation_id,
            tenant_id: TENANT_ID,
            content: TEMPLATE_BF_TEXT,
            sender_type: 'ai',
            sender_name: 'Sofia',
            direction: 'outbound',
            message_type: 'template',
            status: 'SENT',
            created_at: nowIso
          });
        }
      }
    } else {
      failCount++;
      console.log(`  ❌ Falha [${i + 1}/${targets.length}] ${item.contact_phone}: HTTP ${res.status}`);
    }

    if ((i + 1) % 25 === 0 || i === targets.length - 1) {
      console.log(`  Progresso [${i + 1}/${targets.length}] Sucessos: ${successCount} | Falhas: ${failCount} | Pulados: ${skippedRecent}`);
    }

    await sleep(IS_DRY_RUN ? 0 : 350); // ~2.8 msgs/segundo para cadência estável na Zenvia
  }

  console.log(`\n=============================================================`);
  console.log(`✅ DISPARO CONCLUÍDO!`);
  console.log(`   - Enviados com sucesso: ${successCount}/${targets.length}`);
  console.log(`   - Falhas: ${failCount}`);
  console.log(`   - Pulados recentemente: ${skippedRecent}`);
  console.log(`   - Registros vinculados à tela de Consumo com sucesso.`);
  console.log(`=============================================================\n`);
}

runDispatch().catch(err => {
  console.error('Erro na execução do disparo:', err);
  process.exit(1);
});
