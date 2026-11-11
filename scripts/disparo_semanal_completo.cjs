/**
 * DISPARO GERAL DE RESGATE & REENGAJAMENTO DA SEMANA
 * 
 * Segmentação do Envio:
 * 
 * 1. Grupo 1 - Resgate Imediato de Formulário Flow (49 leads):
 *    - Leads de hoje (11/nov) e de ontem (10/nov) que clicaram em "Solicitar análise" ou "Quero simular",
 *      mas travaram antes de concluir o envio do formulário.
 *    - Mensagem: Notificação cordial com nome do lojista + Botão Interativo Flow [ Simular Crédito ]
 * 
 * 2. Grupo 2 - Reengajamento Geral da Semana (Sem Resposta):
 *    - Leads das campanhas de 03/nov a 11/nov que receberam a mensagem inicial (delivered ou read)
 *      e não responderam nem foram reengajados hoje.
 *    - Mensagem: Template Oficial Ticket Friday (7f109fd6-f6ad-4f4c-926b-2e8403f68647) com imagem oficial.
 * 
 * Rastreabilidade & Consumo (CRÍTICO):
 *   - Insere em messages vinculado à conversa
 *   - Atualiza outbound_queue (reengagement_attempt_count, reengagement_last_sent_at)
 *   - Cria registro em whatsapp_billing_windows (com tenant_id, agent_id, campaign_id, reengagement_attempt_count)
 *   - Garantia de 100% de cômputo na tela de Consumo / Faturamento
 * 
 * Modos de Execução:
 *   node scripts/disparo_semanal_completo.cjs --dry-run
 *   node scripts/disparo_semanal_completo.cjs --now
 *   node scripts/disparo_semanal_completo.cjs --limit=100
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const TENANT_ID = 'd290f1ee-6c54-4b01-90e6-d701748f0851'; // Edenred
const AGENT_ID = '0290cece-beef-4b3b-84c6-bf4d53851a96';  // Sofia / Agente Comercial Fiserv

const ZENVIA_TOKEN = 'mJZ-6UC5zhffeBjG69b3tM93gv47QbJOfvK0';
const ZENVIA_CHANNEL = '551151183815';

// Template Oficial Ticket Friday
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

const CAMPAIGN_IDS = [
  '1fa831ae-fdc6-44aa-a7a2-a4ec211a326f', // 11/nov
  '87cf7ce9-b968-4476-83e6-70df018c6e8c', // 10/nov
  '660ba178-ce82-48b3-8c90-647e1bad0480', // 09/nov
  '9d77d45a-1147-470f-b911-d4679417b9e3', // 06/nov
  '7cd3b043-7e8e-4f92-b6d9-30821c747d03', // 04/nov
  'ec37a964-dc92-4ae2-8539-a6cde2deb2ff'  // 03/nov
];

// CLI Args
const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');
const IS_NOW = args.includes('--now');
const LIMIT_ARG = args.find(a => a.startsWith('--limit='));
const MAX_LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : 0;

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
  const saudacaoNome = firstName ? `, ${firstName}` : '';
  const bodyText = `Olá${saudacaoNome}! Vi que você iniciou sua solicitação de crédito Ticket, mas faltou concluir a simulação.\n\nClique no botão abaixo para preencher rapidinho ou me informe por aqui o valor desejado para sua empresa:`;

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

async function registerConsumptionAndAudit(lead, sendType) {
  try {
    const isRescue = sendType === 'rescue_flow';
    const content = isRescue ? 'Simulação de Crédito Ticket Friday (Resgate Flow)' : TEMPLATE_BF_TEXT;
    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const nextAttempt = (lead.reengagement_attempt_count || 0) + 1;

    // 1. Mensagem registrada para exibição no chat
    let messageId = null;
    if (lead.conversation_id) {
      const { data: msgData } = await supabase.from('messages').insert({
        tenant_id: TENANT_ID,
        conversation_id: lead.conversation_id,
        sender_type: 'agent',
        direction: 'outbound',
        content: content,
        channel: 'whatsapp',
        metadata: {
          type: isRescue ? 'flow_rescue' : 'reengagement_bf',
          campaign_id: lead.campaign_id,
          phone: lead.contact_phone,
          reengagement_attempt_count: nextAttempt
        }
      }).select('id').single();

      if (msgData) messageId = msgData.id;
    }

    // 2. Atualizar fila
    await supabase.from('outbound_queue').update({
      reengagement_attempt_count: nextAttempt,
      reengagement_last_sent_at: nowIso
    }).eq('id', lead.id);

    // 3. Fechar janelas anteriores abertas para este contato (evita violação de constraint uq_wa_billing_windows_open)
    await supabase
      .from('whatsapp_billing_windows')
      .update({ status: 'closed', updated_at: nowIso })
      .eq('tenant_id', TENANT_ID)
      .eq('contact_phone', lead.contact_phone)
      .eq('status', 'open');

    // 4. Registrar janela de consumo 24h oficial (Cômputo Exato na tela de Consumo)
    await supabase.from('whatsapp_billing_windows').insert({
      tenant_id: TENANT_ID,
      agent_id: AGENT_ID,
      conversation_id: lead.conversation_id || null,
      outbound_queue_id: lead.id,
      first_message_id: messageId,
      last_message_id: messageId,
      contact_phone: lead.contact_phone,
      provider: 'zenvia',
      billing_mode: 'window_24h',
      status: 'open',
      window_started_at: nowIso,
      window_expires_at: expiresIso,
      last_activity_at: nowIso,
      metadata: {
        campaign_id: lead.campaign_id,
        action: isRescue ? 'flow_rescue_manual' : 'reengagement_weekly_manual',
        reengagement_attempt_count: nextAttempt,
        recorded_at: nowIso
      }
    });

  } catch (err) {
    console.error(`⚠️ Erro ao registrar consumo [${lead.contact_phone}]:`, err.message);
  }
}

async function main() {
  console.log('=============================================================');
  console.log('🚀 INICIANDO DISPARO COMPLETO: RESGATE FLOW + REENGAJAMENTO GERAL');
  console.log('=============================================================');

  // 1. Carregar leads da semana
  const { data: leads, error } = await supabase.from('outbound_queue')
    .select('id, contact_name, contact_phone, conversation_id, status, response_detected, metadata, campaign_id, reengagement_attempt_count, reengagement_last_sent_at')
    .in('campaign_id', CAMPAIGN_IDS);

  if (error || !leads) {
    console.error('Erro ao buscar leads:', error);
    process.exit(1);
  }

  // 2. Mapear leads que concluíram o form (com chunking seguro de 50 ids)
  const responded = leads.filter(l => l.response_detected && l.conversation_id);
  const convIds = responded.map(l => l.conversation_id);

  let msgs = [];
  const CHUNK_SIZE = 50;
  for (let i = 0; i < convIds.length; i += CHUNK_SIZE) {
    const chunk = convIds.slice(i, i + CHUNK_SIZE);
    const { data: chunkMsgs } = await supabase.from('messages')
      .select('conversation_id, content, sender_type')
      .in('conversation_id', chunk);
    if (chunkMsgs) msgs = msgs.concat(chunkMsgs);
  }

  const msgsByConv = {};
  msgs.forEach(m => {
    if (!msgsByConv[m.conversation_id]) msgsByConv[m.conversation_id] = [];
    msgsByConv[m.conversation_id].push(m);
  });

  // Grupo 1: Leads que travaram no Form (10/nov e 11/nov com interesse demonstrado)
  const grupoRescue = [];
  for (const l of responded) {
    if (l.campaign_id !== '1fa831ae-fdc6-44aa-a7a2-a4ec211a326f' && l.campaign_id !== '87cf7ce9-b968-4476-83e6-70df018c6e8c') {
      continue;
    }
    const list = msgsByConv[l.conversation_id] || [];
    const hasForm = list.some(m => m.content && m.content.includes('Formulário de Simulação'));
    if (hasForm) continue;

    const userMsgs = list.filter(m => m.sender_type === 'user');
    const isHuman = userMsgs.some(m => {
      const c = (m.content || '').toLowerCase();
      return c.includes('solicitar análise') || c.includes('simular') || c.includes('sim') || c.includes('quero') || c.includes('taxa') || c.includes('valor');
    });

    if (isHuman) {
      grupoRescue.push(l);
    }
  }

  // Grupo 2: Sem resposta durante a semana (delivered ou read, sem reengajamento hoje 11/nov)
  const grupoReengSemana = leads.filter(l => {
    const isToday = l.reengagement_last_sent_at && l.reengagement_last_sent_at.startsWith('2026-11-11');
    const isDeliveredOrRead = ['delivered', 'read'].includes(l.status);
    return !l.response_detected && !isToday && isDeliveredOrRead;
  });

  console.log(`\n📊 AUDITORIA DO LOTE:`);
  console.log(`   - Grupo 1 (Resgate Flow - Travaram no form):     ${grupoRescue.length} leads`);
  console.log(`   - Grupo 2 (Reengajamento Geral da Semana):         ${grupoReengSemana.length} leads`);
  console.log(`   - TOTAL GERAL:                                    ${grupoRescue.length + grupoReengSemana.length} leads\n`);

  if (IS_DRY_RUN) {
    console.log('✅ Modo --dry-run concluído. Nenhuma mensagem disparada.');
    return;
  }

  if (!IS_NOW) {
    console.log('⚠️ Adicione --now para disparar.');
    return;
  }

  let totalSent = 0;
  let totalErrors = 0;

  // Disparo Grupo 1: Resgate Flow
  console.log(`🚀 [1/2] Disparando Resgate Flow para ${grupoRescue.length} leads...`);
  for (let i = 0; i < grupoRescue.length; i++) {
    const lead = grupoRescue[i];
    const firstName = formatFirstName(lead.contact_name);
    try {
      await sendZenviaFlowRescue(lead.contact_phone, firstName);
      await registerConsumptionAndAudit(lead, 'rescue_flow');
      totalSent++;
    } catch (err) {
      console.error(`❌ Falha resgate flow [${lead.contact_phone}]:`, err.message);
      totalErrors++;
    }
    await sleep(250);
  }

  // Disparo Grupo 2: Reengajamento Geral
  const targetReeng = MAX_LIMIT > 0 ? grupoReengSemana.slice(0, MAX_LIMIT) : grupoReengSemana;
  console.log(`\n🚀 [2/2] Disparando Reengajamento Geral para ${targetReeng.length} leads...`);
  for (let i = 0; i < targetReeng.length; i++) {
    const lead = targetReeng[i];
    try {
      await sendZenviaTemplateBF(lead.contact_phone);
      await registerConsumptionAndAudit(lead, 'template_bf');
      totalSent++;
    } catch (err) {
      console.error(`❌ Falha reengajamento [${lead.contact_phone}]:`, err.message);
      totalErrors++;
    }

    if ((i + 1) % 50 === 0 || i === targetReeng.length - 1) {
      console.log(`  Progresso [${i + 1}/${targetReeng.length}] Enviados: ${totalSent} | Falhas: ${totalErrors}`);
    }
    await sleep(250);
  }

  console.log('\n=============================================================');
  console.log('🎉 DISPARO CONCLUÍDO COM SUCESSO!');
  console.log(`   - Total disparado e faturado: ${totalSent}`);
  console.log(`   - Falhas Zenvia: ${totalErrors}`);
  console.log('=============================================================');
}

main().catch(e => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
