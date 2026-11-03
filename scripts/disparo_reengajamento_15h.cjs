/**
 * DISPARO DE REENGAJAMENTO - CAMPANHA 03/NOV (TICKET FRIDAY)
 * 
 * Execução planejada: 15:00
 * Segmentação:
 * 1. Janela 24h Aberta (Formulário Pendente):
 *    - Leads que clicaram em "Solicitar análise" mas ainda não enviaram o form.
 *    - Envio: Lembrete contextual com o botão interativo do WhatsApp Flow [ Simular Crédito ].
 * 
 * 2. Janela 24h Aberta (Texto Livre / Dúvidas):
 *    - Leads que mandaram texto livre ("Olá", dúvidas, etc.).
 *    - Envio: Convite direto contextual com o botão interativo do WhatsApp Flow [ Simular Crédito ].
 * 
 * 3. Janela 24h Fechada (Leads que não responderam ainda):
 *    - Leads que receberam (delivered/read) a mensagem inicial mas não interagiram.
 *    - Modo 'resumido' (Padrão): Template oficial "Oi! Tudo bem? Conseguiu ver a mensagem que te mandei mais cedo?"
 *      -> Gera altíssima taxa de resposta humana ("Vi sim", "Como funciona?", etc.), abrindo a janela de 24h.
 *    - Modo 'completo': Template Black Friday completo (7f109fd6-f6ad-4f4c-926b-2e8403f68647) com imagem e botão "Solicitar análise".
 * 
 * Uso:
 *   node scripts/disparo_reengajamento_15h.cjs --dry-run
 *   node scripts/disparo_reengajamento_15h.cjs --template=resumido
 *   node scripts/disparo_reengajamento_15h.cjs --template=completo
 *   node scripts/disparo_reengajamento_15h.cjs --schedule-at=15:00
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Configurações
const SUPABASE_URL = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const TENANT_ID = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
const CAMPAIGN_ID = 'ec37a964-dc92-4ae2-8539-a6cde2deb2ff';
const ZENVIA_TOKEN = 'mJZ-6UC5zhffeBjG69b3tM93gv47QbJOfvK0';
const ZENVIA_CHANNEL = '551151183815';

// Templates
const TEMPLATE_RESUMIDO_ID = 'ba5c8112-bd53-4608-bed6-4562cfca1834'; // "Oi! Tudo bem? Conseguiu ver a mensagem que te mandei mais cedo?"
const TEMPLATE_RESUMIDO_TEXT = 'Oi! Tudo bem? Conseguiu ver a mensagem que te mandei mais cedo?';

const TEMPLATE_COMPLETO_ID = '7f109fd6-f6ad-4f4c-926b-2e8403f68647'; // Ticket Friday completo
const TEMPLATE_COMPLETO_IMG = 'https://chat.zenvia.com/storage/folders/a1af1ec136a1e60cf8cb8fa102edd9d872805851206df67904e5ed0cf7043296/files/a2aeb397ae4dd04e213736a206c26b67385ab709ae421b01d0ab73d04cda1bc1.bin';

// Flow v2 Fiserv
const FLOW_ID = '1326442755259970';
const FLOW_TOKEN = '1326442755259970_1740924180';

// Argumentos CLI
const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');
const TEMPLATE_MODE = (args.find(a => a.startsWith('--template=')) || '--template=resumido').split('=')[1].toLowerCase();
const ONLY_READ = args.includes('--only-read'); // se true, dispara apenas para quem já leu (read)
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

async function sendZenviaMessage(toPhone, contents) {
  if (IS_DRY_RUN) {
    return { ok: true, status: 200, data: { dry_run: true } };
  }

  const zenviaUrl = 'https://api.zenvia.com/v2/channels/whatsapp/messages';
  const res = await fetch(zenviaUrl, {
    method: 'POST',
    headers: {
      'X-API-TOKEN': ZENVIA_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: ZENVIA_CHANNEL,
      to: toPhone,
      contents: contents
    })
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, data: json };
}

async function executeReengagement() {
  console.log(`\n=============================================================`);
  console.log(`🚀 INICIANDO DISPARO DE REENGAJAMENTO - CAMPANHA 03/NOV`);
  console.log(`⏰ Horário: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  console.log(`🛠️ Modo: ${IS_DRY_RUN ? 'SIMULAÇÃO (DRY RUN - SEM ENVIOS)' : 'PRODUÇÃO (ENVIOS REAIS)'}`);
  console.log(`📋 Template para Janela Fechada: ${TEMPLATE_MODE.toUpperCase()}`);
  console.log(`=============================================================\n`);

  // 1. Carregar fila e leads
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

  // Filtrar quem já concluiu Fiserv / enviou formulário (não perturbar)
  const completedPhones = new Set();
  leads.forEach(l => {
    if (l.metadata?.requested_amount || l.metadata?.revenue || l.metadata?.opt_in || l.metadata?.fiserv_status) {
      completedPhones.add(l.whatsapp);
    }
  });

  const waitingFormTargets = [];
  const textOnlyTargets = [];
  const deliveredNotReadTargets = [];
  const readTargets = [];
  const sentPendingTargets = [];

  for (const item of queueItems) {
    if (completedPhones.has(item.contact_phone)) continue;

    const lead = leads.find(l => l.whatsapp === item.contact_phone || (l.whatsapp && item.contact_phone && l.whatsapp.slice(-8) === item.contact_phone.slice(-8)));
    const buttonClicked = Boolean(lead?.metadata?.identity_confirmed || lead?.metadata?.button_clicked);
    const hasResponse = item.response_detected || ['respondida', 'interagiu'].includes(item.status);

    if (hasResponse) {
      if (buttonClicked) {
        waitingFormTargets.push({ queue: item, lead });
      } else {
        textOnlyTargets.push({ queue: item, lead });
      }
    } else {
      if (item.status === 'delivered') {
        deliveredNotReadTargets.push({ queue: item, lead });
      } else if (item.status === 'read') {
        readTargets.push({ queue: item, lead });
      } else if (item.status === 'sent') {
        sentPendingTargets.push({ queue: item, lead });
      }
    }
  }

  // Janela Fechada: Inclui quem recebeu no celular e NÃO leu (delivered) + quem LEU (read) + enviados (sent)
  const closedWindowTargets = [...deliveredNotReadTargets, ...readTargets, ...sentPendingTargets];

  console.log(`📊 PÚBLICO SELECIONADO PARA DISPARO:`);
  console.log(`   🟢 JANELA ABERTA (24h ativa):`);
  console.log(`      - Clicaram no Botão / Form Pendente: ${waitingFormTargets.length}`);
  console.log(`      - Mensagem Livre / Dúvidas: ${textOnlyTargets.length}`);
  console.log(`   🔵 JANELA FECHADA (Template Oficial):`);
  console.log(`      - Receberam no celular e NÃO LERAM (delivered): ${deliveredNotReadTargets.length}`);
  console.log(`      - Receberam no celular e LERAM (read): ${readTargets.length}`);
  console.log(`      - Enviados aguardando confirmação (sent): ${sentPendingTargets.length}`);
  console.log(`      => Subtotal Janela Fechada: ${closedWindowTargets.length}`);
  console.log(`   ----------------------------------------------------------`);
  console.log(`   🔥 TOTAL GERAL DE LEADS A SEREM REENGAJADOS: ${waitingFormTargets.length + textOnlyTargets.length + closedWindowTargets.length}\n`);

  // =========================================================================
  // ETAPA 1: JANELA ABERTA - FORMULÁRIO PENDENTE (REFORÇO DO FLOW BUTTON)
  // =========================================================================
  console.log(`--- ETAPA 1: REENGAJANDO ${waitingFormTargets.length} LEADS COM FORMULÁRIO PENDENTE ---`);
  let wfSuccess = 0;
  for (let i = 0; i < waitingFormTargets.length; i++) {
    const { queue, lead } = waitingFormTargets[i];
    const firstName = extractFirstName(lead?.name || queue.contact_name);

    const bodyMsg = `Olá, *${firstName}*! Vi que você pediu a simulação da Ticket Friday para o seu estabelecimento.\n\nPara liberarmos os valores (de R$ 10 mil a R$ 500 mil) e taxas em até 24h, basta clicar no botão abaixo e preencher em menos de 1 minuto:`;
    const payload = [
      {
        type: 'flow',
        body: bodyMsg,
        flow: {
          mode: 'published',
          token: `reengage_wf_${Date.now()}_${i}`,
          id: FLOW_ID,
          buttonText: 'Simular Crédito',
          action: {
            type: 'navigate',
            screen: 'SIMULACAO_SCREEN'
          }
        }
      }
    ];

    const res = await sendZenviaMessage(queue.contact_phone, payload);
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
          created_at: new Date().toISOString()
        });
      }
    } else {
      console.log(`  ❌ [${i + 1}/${waitingFormTargets.length}] ${queue.contact_phone} => Erro HTTP ${res.status}`);
    }
    await sleep(IS_DRY_RUN ? 0 : 400);
  }

  // =========================================================================
  // ETAPA 2: JANELA ABERTA - TEXTO LIVRE (CONVITE DIRETO AO FLOW)
  // =========================================================================
  console.log(`\n--- ETAPA 2: REENGAJANDO ${textOnlyTargets.length} LEADS DE TEXTO LIVRE ---`);
  let toSuccess = 0;
  for (let i = 0; i < textOnlyTargets.length; i++) {
    const { queue, lead } = textOnlyTargets[i];
    const firstName = extractFirstName(lead?.name || queue.contact_name);

    const bodyMsg = `Olá, *${firstName}*! Passando para te lembrar que na condição especial da Ticket Friday você solicita crédito em novembro e começa a pagar só em 2027! 🖤\n\nQuer ver quanto está liberado para o seu CNPJ? Clique no botão abaixo para simular sem compromisso:`;
    const payload = [
      {
        type: 'flow',
        body: bodyMsg,
        flow: {
          mode: 'published',
          token: `reengage_to_${Date.now()}_${i}`,
          id: FLOW_ID,
          buttonText: 'Simular Crédito',
          action: {
            type: 'navigate',
            screen: 'SIMULACAO_SCREEN'
          }
        }
      }
    ];

    const res = await sendZenviaMessage(queue.contact_phone, payload);
    if (res.ok) {
      toSuccess++;
      console.log(`  ✅ [${i + 1}/${textOnlyTargets.length}] ${queue.contact_phone} (${firstName}) => Convite Flow enviado.`);
      
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
          created_at: new Date().toISOString()
        });
      }
    } else {
      console.log(`  ❌ [${i + 1}/${textOnlyTargets.length}] ${queue.contact_phone} => Erro HTTP ${res.status}`);
    }
    await sleep(IS_DRY_RUN ? 0 : 400);
  }

  // =========================================================================
  // ETAPA 3: JANELA FECHADA - TEMPLATE PARA QUEM NÃO RESPONDEU AINDA
  // =========================================================================
  console.log(`\n--- ETAPA 3: DISPARANDO TEMPLATE (${TEMPLATE_MODE.toUpperCase()}) PARA ${closedWindowTargets.length} LEADS ---`);
  let cwSuccess = 0;
  let cwFailed = 0;

  for (let i = 0; i < closedWindowTargets.length; i++) {
    const { queue, lead } = closedWindowTargets[i];

    let payloadContents = [];
    let logMsg = '';

    if (TEMPLATE_MODE === 'completo') {
      // Template Black Friday oficial com imagem e botão
      payloadContents = [
        {
          type: 'template',
          templateId: TEMPLATE_COMPLETO_ID,
          fields: {
            imageUrl: TEMPLATE_COMPLETO_IMG
          }
        }
      ];
      logMsg = 'Template Ticket Friday Completo';
    } else {
      // Template Resumido Oficial (Pergunta curta)
      payloadContents = [
        {
          type: 'template',
          templateId: TEMPLATE_RESUMIDO_ID,
          fields: {}
        }
      ];
      logMsg = TEMPLATE_RESUMIDO_TEXT;
    }

    const res = await sendZenviaMessage(queue.contact_phone, payloadContents);
    const nowIso = new Date().toISOString();

    if (res.ok) {
      cwSuccess++;
      if (!IS_DRY_RUN) {
        await supabase.from('outbound_queue').update({
          reengagement_attempt_count: (queue.reengagement_attempt_count || 0) + 1,
          reengagement_last_sent_at: nowIso,
          last_attempt_at: nowIso
        }).eq('id', queue.id);

        if (queue.conversation_id) {
          await supabase.from('messages').insert({
            conversation_id: queue.conversation_id,
            tenant_id: TENANT_ID,
            content: logMsg,
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
      console.log(`  Progresso [${i + 1}/${closedWindowTargets.length}] Sucessos: ${cwSuccess} | Falhas: ${cwFailed}`);
    }
    await sleep(IS_DRY_RUN ? 0 : 350); // taxa segura de envio (~2.5 msgs/s)
  }

  console.log(`\n=============================================================`);
  console.log(`🎉 DISPARO DE REENGAJAMENTO CONCLUÍDO!`);
  console.log(`   - Form Pendente (Janela Aberta): ${wfSuccess}/${waitingFormTargets.length}`);
  console.log(`   - Texto Livre (Janela Aberta): ${toSuccess}/${textOnlyTargets.length}`);
  console.log(`   - Template (${TEMPLATE_MODE}): ${cwSuccess}/${closedWindowTargets.length}`);
  console.log(`=============================================================\n`);
}

// Suporte a agendamento automático
if (SCHEDULE_ARG) {
  const targetTimeStr = SCHEDULE_ARG.split('=')[1]; // ex: "15:00"
  const [targetH, targetM] = targetTimeStr.split(':').map(Number);
  
  function checkSchedule() {
    const now = new Date();
    // Ajustar para fuso de Brasília (UTC-3)
    const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const currentH = brTime.getHours();
    const currentM = brTime.getMinutes();

    console.log(`⏳ Aguardando horário alvo ${targetTimeStr}... (Horário atual Brasília: ${String(currentH).padStart(2, '0')}:${String(currentM).padStart(2, '0')})`);

    if (currentH > targetH || (currentH === targetH && currentM >= targetM)) {
      console.log(`⏰ HORÁRIO ATINGIDO (${targetTimeStr})! Disparando reengajamento...`);
      executeReengagement();
    } else {
      setTimeout(checkSchedule, 20000); // Checa a cada 20 segundos
    }
  }
  checkSchedule();
} else {
  executeReengagement();
}
