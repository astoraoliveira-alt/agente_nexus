/**
 * DISPARO DE AQUECIMENTO E REENGAJAMENTO GERAL - 10/NOV ÀS 15:30
 * 
 * Segmentação do Envio (Mandar para TODOS os aptos):
 * 
 * Grupo 1 - Resgate Imediato de Flow (Janela 24h aberta):
 *   - Leads da campanha de 10/nov que clicaram/responderam positivamente mas não enviaram o formulário.
 *   - Envio: Mensagem personalizada com botão nativo [ Simular Crédito ] (WhatsApp Flow).
 * 
 * Grupo 2 - Reengajamento Completo Ticket Friday:
 *   - Leads de 10/nov que leram ou receberam mas não responderam.
 *   - Leads remanescentes de 09/nov que ainda não receberam reengajamento hoje e não responderam.
 *   - Envio: Template Completo Ticket Friday (7f109fd6-f6ad-4f4c-926b-2e8403f68647) com imagem oficial e botão "Solicitar análise".
 * 
 * Rastreabilidade & Consumo:
 *   - Atualiza outbound_queue e messages
 *   - Registra consumo em whatsapp_billing_windows
 * 
 * Modos de Execução:
 *   node scripts/aquecimento_15h30.cjs --dry-run
 *   node scripts/aquecimento_15h30.cjs --now
 *   node scripts/aquecimento_15h30.cjs --schedule-at=15:30
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const TENANT_ID = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
const CAMPAIGN_10NOV = '87cf7ce9-b968-4476-83e6-70df018c6e8c';
const CAMPAIGN_09NOV = '660ba178-ce82-48b3-8c90-647e1bad0480';

const ZENVIA_TOKEN = 'mJZ-6UC5zhffeBjG69b3tM93gv47QbJOfvK0';
const ZENVIA_CHANNEL = '551151183815';

// Template Oficial Ticket Friday (Completo)
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

// Flow Resgate
const FLOW_ID = '1135459742362876';

// Argumentos CLI
const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');
const IS_NOW = args.includes('--now');
const SCHEDULE_ARG = args.find(a => a.startsWith('--schedule-at='));
const SCHEDULE_TIME = SCHEDULE_ARG ? SCHEDULE_ARG.split('=')[1] : null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function formatFirstName(rawName) {
  if (!rawName) return '';
  let clean = rawName.replace(/^\d+[\d\.\-\/\s]+/, '').trim();
  const words = clean.split(/\s+/).filter(w => !['LTDA', 'ME', 'EPP', 'EIRELI', 'S/A', 'SA'].includes(w.toUpperCase()));
  if (words.length > 0) {
    const w = words[0].toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  return '';
}

async function sendZenviaFlowRescue(toPhone, firstName) {
  const greeting = firstName ? `Oi, ${firstName}! ` : 'Oi! ';
  const bodyText = `${greeting}Notei que você começou a simulação da condição especial de fim de ano da Ticket, mas não concluiu o preenchimento.\n\nPara garantir a taxa a partir de 1,89% a.m. e a primeira parcela só em 2027, basta clicar no botão abaixo para concluir rapidinho:`;

  const payload = {
    from: ZENVIA_CHANNEL,
    to: toPhone,
    contents: [
      {
        type: 'interactive',
        interactive: {
          type: 'flow',
          header: {
            type: 'text',
            text: 'Simulação de Crédito Ticket Friday'
          },
          body: {
            text: bodyText
          },
          footer: {
            text: 'Em parceria com a Fiserv'
          },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_token: `FLOW_${toPhone}_${Date.now()}`,
              flow_id: FLOW_ID,
              flow_cta: 'Simular Crédito',
              flow_action: 'navigate',
              flow_action_payload: {
                screen: 'SIMULACAO_SCREEN',
                data: {}
              }
            }
          }
        }
      }
    ]
  };

  const res = await fetch('https://api.zenvia.com/v2/channels/whatsapp/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-TOKEN': ZENVIA_TOKEN
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Zenvia Flow Error (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function sendZenviaTemplateBF(toPhone) {
  const payload = {
    from: ZENVIA_CHANNEL,
    to: toPhone,
    contents: [
      {
        type: 'template',
        templateId: TEMPLATE_BF_ID,
        fields: {
          header_image: TEMPLATE_BF_IMG
        }
      }
    ]
  };

  const res = await fetch('https://api.zenvia.com/v2/channels/whatsapp/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-TOKEN': ZENVIA_TOKEN
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Zenvia Template Error (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function registerConsumption(lead, sendType) {
  try {
    const isRescue = sendType === 'rescue_flow';
    const content = isRescue ? 'Simulação de Crédito Ticket Friday (Resgate Flow)' : TEMPLATE_BF_TEXT;

    // 1. Inserir em messages
    if (lead.conversation_id) {
      await supabase.from('messages').insert({
        tenant_id: TENANT_ID,
        conversation_id: lead.conversation_id,
        sender_type: 'agent',
        direction: 'outbound',
        content: content,
        channel: 'whatsapp',
        metadata: {
          type: isRescue ? 'flow_rescue_15h30' : 'template_bf_15h30',
          campaign_id: lead.campaign_id,
          phone: lead.contact_phone
        }
      });
    }

    // 2. Atualizar outbound_queue
    await supabase.from('outbound_queue').update({
      reengagement_attempt_count: (lead.reengagement_attempt_count || 0) + 1,
      reengagement_last_sent_at: new Date().toISOString()
    }).eq('id', lead.id);

    // 3. Registrar janela de consumo
    await supabase.from('whatsapp_billing_windows').insert({
      tenant_id: TENANT_ID,
      contact_phone: lead.contact_phone,
      window_started_at: new Date().toISOString(),
      window_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      is_active: true,
      category: 'marketing',
      pricing_tier: 'standard',
      chargeable: true,
      metadata: {
        campaign_id: lead.campaign_id,
        action: isRescue ? 'flow_rescue_15h30' : 'reengagement_bf_15h30',
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error(`Erro ao registrar consumo para ${lead.contact_phone}:`, err.message);
  }
}

async function waitScheduledTime(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  console.log(`⏰ Aguardando horário programado: ${timeStr}...`);
  while (true) {
    const now = new Date();
    // Considera horário local de Brasília
    const curH = now.getHours();
    const curM = now.getMinutes();
    if (curH > hours || (curH === hours && curM >= minutes)) {
      console.log(`🚀 Horário atingido (${timeStr})! Iniciando disparos.`);
      break;
    }
    const diffMs = ((hours * 60 + minutes) - (curH * 60 + curM)) * 60000;
    console.log(`⏳ Falta(m) cerca de ${Math.max(1, Math.round(diffMs / 60000))} minuto(s) até as ${timeStr}.`);
    await sleep(20000);
  }
}

async function main() {
  console.log('=============================================================');
  console.log('🔥 PREPARAÇÃO DO AQUECIMENTO & REENGAJAMENTO GERAL (15:30)');
  console.log('=============================================================');

  if (SCHEDULE_TIME) {
    await waitScheduledTime(SCHEDULE_TIME);
  }

  // 1. Mapeamento dos Leads de 10/nov
  const { data: oq10 } = await supabase.from('outbound_queue')
    .select('id, contact_name, contact_phone, conversation_id, status, response_detected, metadata, campaign_id, reengagement_attempt_count')
    .eq('campaign_id', CAMPAIGN_10NOV);

  // 2. Mapeamento dos Leads de 09/nov
  const { data: oq09 } = await supabase.from('outbound_queue')
    .select('id, contact_name, contact_phone, conversation_id, status, response_detected, metadata, campaign_id, reengagement_attempt_count, reengagement_last_sent_at')
    .eq('campaign_id', CAMPAIGN_09NOV);

  // Mapear quem concluiu o formulário hoje
  const convIds10 = oq10.filter(o => o.response_detected).map(o => o.conversation_id).filter(Boolean);
  const { data: msgs10 } = await supabase.from('messages')
    .select('conversation_id, content')
    .in('conversation_id', convIds10);

  const formFilledConvs = new Set();
  msgs10?.forEach(m => {
    if (m.content && m.content.includes('Formulário de Simulação')) {
      formFilledConvs.add(m.conversation_id);
    }
  });

  // Grupo 1: Resgate Flow (Travados no formulário)
  const grupoRescueFlow = oq10.filter(o => o.response_detected && !formFilledConvs.has(o.conversation_id));

  // Grupo 2A: 10/nov Lidos sem resposta
  const grupoLidos10 = oq10.filter(o => o.status === 'read' && !o.response_detected);

  // Grupo 2B: 10/nov Entregues sem leitura/resposta
  const grupoEntregues10 = oq10.filter(o => o.status === 'delivered' && !o.response_detected);

  // Grupo 2C: 09/nov Restantes aptos (não reengajados hoje)
  const grupoSobra09 = oq09.filter(o => {
    const reengHoje = o.reengagement_last_sent_at && o.reengagement_last_sent_at.startsWith('2026-11-10');
    return !o.response_detected && !reengHoje && (o.status === 'delivered' || o.status === 'read');
  });

  console.log(`\n📊 AUDITORIA DO PÚBLICO:`);
  console.log(`  1. Resgate Flow (clicaram/responderam sem form): ${grupoRescueFlow.length} leads`);
  console.log(`  2. Lidos 10/nov (sem resposta):                   ${grupoLidos10.length} leads`);
  console.log(`  3. Entregues 10/nov (sem resposta):                ${grupoEntregues10.length} leads`);
  console.log(`  4. Restantes 09/nov (aptos sem resposta):          ${grupoSobra09.length} leads`);
  console.log(`  TOTAL GERAL PARA O DISPARO:                        ${grupoRescueFlow.length + grupoLidos10.length + grupoEntregues10.length + grupoSobra09.length} leads\n`);

  if (IS_DRY_RUN) {
    console.log('✅ Modo --dry-run concluído. Nenhuma mensagem enviada.');
    return;
  }

  if (!IS_NOW && !SCHEDULE_TIME) {
    console.log('⚠️ Informe --now para disparar imediatamente ou --schedule-at=15:30 para agendar.');
    return;
  }

  // Execução do Envio
  let sentRescue = 0;
  let sentBF = 0;
  let errors = 0;

  // 1. Envio Resgate Flow
  console.log(`🚀 Iniciando envio do Grupo 1 (Resgate Flow - ${grupoRescueFlow.length} leads)...`);
  for (let i = 0; i < grupoRescueFlow.length; i++) {
    const lead = grupoRescueFlow[i];
    const firstName = formatFirstName(lead.contact_name);
    try {
      await sendZenviaFlowRescue(lead.contact_phone, firstName);
      await registerConsumption(lead, 'rescue_flow');
      sentRescue++;
    } catch (err) {
      console.error(`❌ Falha no resgate flow [${lead.contact_phone}]:`, err.message);
      errors++;
    }
    await sleep(250);
  }

  // 2. Envio Template Completo BF
  const leadsTemplateBF = [...grupoLidos10, ...grupoEntregues10, ...grupoSobra09];
  console.log(`🚀 Iniciando envio do Grupo 2 (Template Completo Ticket Friday - ${leadsTemplateBF.length} leads)...`);
  for (let i = 0; i < leadsTemplateBF.length; i++) {
    const lead = leadsTemplateBF[i];
    try {
      await sendZenviaTemplateBF(lead.contact_phone);
      await registerConsumption(lead, 'template_bf');
      sentBF++;
    } catch (err) {
      console.error(`❌ Falha no template BF [${lead.contact_phone}]:`, err.message);
      errors++;
    }

    if ((i + 1) % 25 === 0 || i === leadsTemplateBF.length - 1) {
      console.log(`  Progresso Template BF [${i + 1}/${leadsTemplateBF.length}] Enviados: ${sentBF} | Erros: ${errors}`);
    }
    await sleep(250);
  }

  console.log('\n=============================================================');
  console.log('🎉 DISPARO DE AQUECIMENTO E REENGAJAMENTO CONCLUÍDO!');
  console.log(`   - Resgate Flow: ${sentRescue}/${grupoRescueFlow.length}`);
  console.log(`   - Template Completo BF: ${sentBF}/${leadsTemplateBF.length}`);
  console.log(`   - Total Sucessos: ${sentRescue + sentBF}`);
  console.log(`   - Falhas: ${errors}`);
  console.log('=============================================================');
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
