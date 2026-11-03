/**
 * DISPARO DE REENGAJAMENTO - CAMPANHA 03/NOV (18:00)
 * 
 * Segmentação do Envio:
 * 1. ETAPA 1 - LEADS QUE CONFIRMARAM COM FORMULÁRIO PENDENTE:
 *    - Leads que clicaram no botão "Solicitar análise" mas ainda não enviaram o form.
 *    - Envio: Lembrete contextual com o botão interativo do WhatsApp Flow [ Simular Crédito ].
 *    - O formulário abre diretamente no WhatsApp do cliente com 1 clique para ele preencher.
 * 
 * 2. ETAPA 2 - LEADS SEM INTERAÇÃO AO LONGO DO DIA (JANELA FECHADA):
 *    - ~632 leads que receberam hoje a campanha (status: delivered, read, sent) e não interagiram.
 *    - Envio: Template oficial da Black Friday (7f109fd6-f6ad-4f4c-926b-2e8403f68647)
 *      com banner da campanha e botão de resposta rápida [ Solicitar análise ].
 * 
 * Uso:
 *   node scripts/disparo_reengajamento_18h.cjs --dry-run
 *   node scripts/disparo_reengajamento_18h.cjs --schedule-at=18:00
 *   node scripts/disparo_reengajamento_18h.cjs (execução imediata)
 */

const { createClient } = require('@supabase/supabase-js');

// Configurações
const SUPABASE_URL = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const TENANT_ID = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
const CAMPAIGN_ID = 'ec37a964-dc92-4ae2-8539-a6cde2deb2ff';
const ZENVIA_TOKEN = 'mJZ-6UC5zhffeBjG69b3tM93gv47QbJOfvK0';
const ZENVIA_CHANNEL = '551151183815';

// WhatsApp Flow v2 Fiserv
const FLOW_ID = '1326442755259970';

// Template Black Friday Oficial (Hoje)
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

// Argumentos CLI
const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');
const SCHEDULE_ARG = args.find(a => a.startsWith('--schedule-at='));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractFirstName(rawName) {
  if (!rawName) return 'parceiro(a)';
  const cleaned = String(rawName)
    .replace(/^[0-9.\-\/\s]+/, '')
    .replace(/\b(LTDA|ME|EIRELI|S\/A|SA|EPP|COMERCIO|DE|ALIMENTOS|RESTAURANTE|MERCADO|SUPERMERCADO|PADARIA|LANCHONETE|PIZZARIA|MINIMERCADO|MERCEARIA|ACOUGUE|EMPORIO|DISTRIBUIDORA)\b/gi, '')
    .trim();
  const first = cleaned.split(/\s+/)[0];
  if (!first || first.length < 2) return rawName.replace(/^[0-9.\-\/\s]+/, '').trim().split(/\s+/)[0] || 'parceiro(a)';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

async function sendZenviaContents(toPhone, contents, maxRetries = 3) {
  if (IS_DRY_RUN) {
    return { ok: true, status: 200, data: { dry_run: true } };
  }

  const zenviaUrl = 'https://api.zenvia.com/v2/channels/whatsapp/messages';

  const payload = {
    from: ZENVIA_CHANNEL,
    to: toPhone,
    contents: contents
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

      return { ok: res.ok, status: res.status, data: json };
    } catch (err) {
      if (attempt < maxRetries) {
        console.log(`    ⚠️ Tentativa ${attempt} falhou para ${toPhone} (${err.message}). Retentando em 1.5s...`);
        await sleep(1500);
      } else {
        return { ok: false, status: 0, error: err.message };
      }
    }
  }
}

async function executeDispatch18h() {
  console.log(`\n=============================================================`);
  console.log(`🚀 INICIANDO DISPARO DE REENGAJAMENTO (18:00)`);
  console.log(`⏰ Horário: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  console.log(`🛠️ Modo: ${IS_DRY_RUN ? 'SIMULAÇÃO (DRY RUN - SEM ENVIOS)' : 'PRODUÇÃO (ENVIOS REAIS)'}`);
  console.log(`=============================================================\n`);

  // 1. Carregar fila e leads da campanha
  const { data: queueItems, error: qErr } = await supabase
    .from('outbound_queue')
    .select('id, contact_name, contact_phone, status, response_detected, conversation_id, metadata, reengagement_attempt_count')
    .eq('campaign_id', CAMPAIGN_ID);

  if (qErr) {
    console.error('❌ Erro ao consultar outbound_queue:', qErr);
    return;
  }

  const { data: leads, error: lErr } = await supabase
    .from('agent_leads')
    .select('id, name, whatsapp, identifier, metadata, status')
    .eq('campaign_id', CAMPAIGN_ID);

  if (lErr) {
    console.error('❌ Erro ao consultar agent_leads:', lErr);
    return;
  }

  // 2. Mapear quem concluiu envio do formulário ou já está na Fiserv (não perturbar)
  const completedPhones = new Set();
  leads.forEach(l => {
    const meta = l.metadata || {};
    if (meta.requested_amount || meta.revenue || meta.opt_in || meta.fiserv_status) {
      completedPhones.add(l.whatsapp);
    }
  });

  // 3. Segmentar:
  // - waitingFormTargets: Clicaram no botão / confirmaram, mas ainda não mandaram o form
  // - closedWindowTargets: Entregues/lidos sem nenhuma resposta ao longo do dia
  const waitingFormTargets = [];
  const closedWindowTargets = [];

  for (const item of queueItems) {
    if (['not_delivered', 'failed'].includes(item.status)) continue;
    if (completedPhones.has(item.contact_phone)) continue;

    const lead = leads.find(l => l.whatsapp === item.contact_phone || (l.whatsapp && item.contact_phone && l.whatsapp.slice(-8) === item.contact_phone.slice(-8)));
    const meta = lead?.metadata || {};
    const hasConfirmed = Boolean(meta.button_clicked || meta.identity_confirmed || meta.confirmaram);
    const hasInteracted = item.response_detected || ['respondida', 'interagiu'].includes(item.status);

    if (hasConfirmed) {
      waitingFormTargets.push({ queue: item, lead });
    } else if (!hasInteracted) {
      closedWindowTargets.push({ queue: item, lead });
    }
  }

  const breakdownClosed = { read: 0, delivered: 0, sent: 0 };
  closedWindowTargets.forEach(t => {
    breakdownClosed[t.queue.status] = (breakdownClosed[t.queue.status] || 0) + 1;
  });

  console.log(`📊 PÚBLICO-ALVO PARA O DISPARO DAS 18:00:`);
  console.log(`   🟢 ETAPA 1 - CONFIRMARAM (Formulário Pendente): ${waitingFormTargets.length} leads`);
  console.log(`      Envio: Mensagem personalizada + Botão nativo WhatsApp Flow [ Simular Crédito ]`);
  console.log(`   🔵 ETAPA 2 - JANELA FECHADA (Sem Interação Hoje): ${closedWindowTargets.length} leads`);
  console.log(`      Envio: Template Black Friday oficial com Botão [ Solicitar análise ]`);
  console.log(`      - Lidos sem resposta (read): ${breakdownClosed.read}`);
  console.log(`      - Entregues não lidos (delivered): ${breakdownClosed.delivered}`);
  console.log(`      - Enviados aguardando confirmação (sent): ${breakdownClosed.sent}`);
  console.log(`-------------------------------------------------------------\n`);

  // =========================================================================
  // ETAPA 1: LEMBRETE PARA LEADS QUE CONFIRMARAM MAS NÃO ENVIARAM O FORM
  // =========================================================================
  console.log(`--- ETAPA 1: REENVIANDO FORMULÁRIO FLOW PARA OS ${waitingFormTargets.length} LEADS CONFIRMADOS ---`);
  let wfSuccess = 0;
  let wfFailed = 0;

  for (let i = 0; i < waitingFormTargets.length; i++) {
    const { queue, lead } = waitingFormTargets[i];
    const firstName = extractFirstName(lead?.name || queue.contact_name);

    // Checagem de segurança: não enviar se recebeu mensagem nos últimos 30 min
    if (queue.conversation_id && !IS_DRY_RUN) {
      const { data: recentMsgs } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', queue.conversation_id)
        .eq('sender_type', 'ai')
        .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .limit(1);

      if (recentMsgs && recentMsgs.length > 0) {
        console.log(`  ⏭️ [${i + 1}/${waitingFormTargets.length}] ${queue.contact_phone} (${firstName}) recebeu msg recente. Pulando.`);
        wfSuccess++;
        continue;
      }
    }

    const bodyMsg = `Olá, *${firstName}*! Vi que você pediu a simulação da Ticket Friday para o seu estabelecimento.\n\nPara liberarmos os valores (de R$ 10 mil a R$ 500 mil) e taxas em até 24h, basta clicar no botão abaixo e preencher em menos de 1 minuto:`;
    const payloadFlow = [
      {
        type: 'flow',
        body: bodyMsg,
        flow: {
          mode: 'published',
          token: `reengage_wf_18h_${Date.now()}_${i}`,
          id: FLOW_ID,
          buttonText: 'Simular Crédito',
          action: {
            type: 'navigate',
            screen: 'SIMULACAO_SCREEN'
          }
        }
      }
    ];

    const res = await sendZenviaContents(queue.contact_phone, payloadFlow);
    const nowIso = new Date().toISOString();

    if (res.ok) {
      wfSuccess++;
      console.log(`  ✅ [${i + 1}/${waitingFormTargets.length}] ${queue.contact_phone} (${firstName}) => Flow reenviado com sucesso.`);

      if (!IS_DRY_RUN && queue.conversation_id) {
        await supabase.from('messages').insert({
          conversation_id: queue.conversation_id,
          tenant_id: TENANT_ID,
          content: bodyMsg,
          sender_type: 'ai',
          sender_name: 'Sofia',
          direction: 'outbound',
          message_type: 'flow',
          status: 'SENT',
          created_at: nowIso
        });
      }
    } else {
      wfFailed++;
      console.log(`  ❌ [${i + 1}/${waitingFormTargets.length}] ${queue.contact_phone} => Falha HTTP ${res.status}`);
    }

    await sleep(IS_DRY_RUN ? 0 : 400);
  }

  // =========================================================================
  // ETAPA 2: TEMPLATE BLACK FRIDAY PARA OS LEADS SEM INTERAÇÃO (632 LEADS)
  // =========================================================================
  console.log(`\n--- ETAPA 2: DISPARANDO TEMPLATE BLACK FRIDAY PARA ${closedWindowTargets.length} LEADS ---`);
  let cwSuccess = 0;
  let cwFailed = 0;
  let skippedRecent = 0;

  const payloadBF = [
    {
      type: 'template',
      templateId: TEMPLATE_BF_ID,
      fields: {
        imageUrl: TEMPLATE_BF_IMG
      }
    }
  ];

  for (let i = 0; i < closedWindowTargets.length; i++) {
    const { queue } = closedWindowTargets[i];

    // Checagem de segurança: não enviar se recebeu mensagem nos últimos 45 minutos
    if (queue.conversation_id && !IS_DRY_RUN) {
      const { data: recentMsgs } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', queue.conversation_id)
        .eq('sender_type', 'ai')
        .gte('created_at', new Date(Date.now() - 45 * 60 * 1000).toISOString())
        .limit(1);

      if (recentMsgs && recentMsgs.length > 0) {
        skippedRecent++;
        continue;
      }
    }

    const res = await sendZenviaContents(queue.contact_phone, payloadBF);
    const nowIso = new Date().toISOString();

    if (res.ok) {
      cwSuccess++;
      if (!IS_DRY_RUN) {
        // Atualiza contadores de reengajamento SEM alterar status para 'sent' (preserva m_entregues)
        await supabase.from('outbound_queue').update({
          reengagement_attempt_count: (queue.reengagement_attempt_count || 0) + 1,
          reengagement_last_sent_at: nowIso,
          last_attempt_at: nowIso
        }).eq('id', queue.id);

        if (queue.conversation_id) {
          await supabase.from('messages').insert({
            conversation_id: queue.conversation_id,
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
      cwFailed++;
      console.log(`  ❌ Falha [${i + 1}/${closedWindowTargets.length}] ${queue.contact_phone}: HTTP ${res.status}`);
    }

    if ((i + 1) % 50 === 0 || i === closedWindowTargets.length - 1) {
      console.log(`  Progresso [${i + 1}/${closedWindowTargets.length}] Sucessos: ${cwSuccess} | Falhas: ${cwFailed} | Pulados recentes: ${skippedRecent}`);
    }

    await sleep(IS_DRY_RUN ? 0 : 350); // ~2.8 msgs/segundo
  }

  console.log(`\n=============================================================`);
  console.log(`🎉 DISPARO DAS 18:00 CONCLUÍDO COM SUCESSO!`);
  console.log(`   - Form Pendente (Flow): ${wfSuccess}/${waitingFormTargets.length}`);
  console.log(`   - Template Black Friday (632 leads): ${cwSuccess}/${closedWindowTargets.length}`);
  console.log(`   - Falhas totais: ${wfFailed + cwFailed}`);
  console.log(`=============================================================\n`);
}

// Suporte a agendamento automático para 18:00
if (SCHEDULE_ARG) {
  const targetTimeStr = SCHEDULE_ARG.split('=')[1] || '18:00';
  const [targetH, targetM] = targetTimeStr.split(':').map(Number);

  console.log(`⏳ Agendador ativo para às ${targetTimeStr} (horário de Brasília). Aguardando...`);

  function checkSchedule() {
    const now = new Date();
    const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const currentH = brTime.getHours();
    const currentM = brTime.getMinutes();

    const formattedNow = `${String(currentH).padStart(2, '0')}:${String(currentM).padStart(2, '0')}`;

    if (currentH > targetH || (currentH === targetH && currentM >= targetM)) {
      console.log(`\n⏰ [${formattedNow}] HORÁRIO ALVO (${targetTimeStr}) ATINGIDO! Iniciando execução do disparo...`);
      executeDispatch18h();
    } else {
      const remainingMin = (targetH * 60 + targetM) - (currentH * 60 + currentM);
      process.stdout.write(`\r⏳ [${formattedNow}] Aguardando ${targetTimeStr}... (Faltam ~${remainingMin} minutos)`);
      setTimeout(checkSchedule, 15000); // Checa a cada 15 segundos
    }
  }

  checkSchedule();
} else {
  executeDispatch18h();
}
