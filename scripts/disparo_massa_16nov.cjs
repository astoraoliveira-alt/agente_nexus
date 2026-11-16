/**
 * DISPARO EM MASSA - 16/NOV (15:15+)
 *
 * Executa 4 frentes deduplicadas e higienizadas:
 * 1. Reaquecimento de Aprovados Fiserv sem atendimento humano (Template: 8ea3c2b0-5f3b-4ef4-895a-5f8b54524622)
 * 2. Continuação de Conversa Hoje 16/nov - dentro da janela 24h (WhatsApp Flow: 1135459742362876)
 * 3. Continuação de Conversa Semana Passada 09-13/nov - fora 24h (Template: ba5c8112-bd53-4608-bed6-4562cfca1834)
 * 4. Reengajamento Lidos sem Resposta Semana Passada 09-13/nov (Template: ba5c8112-bd53-4608-bed6-4562cfca1834)
 *
 * Uso:
 *   node scripts/disparo_massa_16nov.cjs --dry-run
 *   node scripts/disparo_massa_16nov.cjs
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const SUPABASE_URL = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const TENANT_ID = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
const AGENT_ID = '0290cece-beef-4b3b-84c6-bf4d53851a96';
const ZENVIA_CHANNEL = '551151183815';
const ZENVIA_TOKEN = 'RzWJ6TUddARV5tgPEqyk9qTS8af5WnXQutg7';

const TEMPLATE_APROVADOS_ID = '8ea3c2b0-5f3b-4ef4-895a-5f8b54524622';
const TEMPLATE_APROVADOS_TEXT = `Olá! A Ticket tem uma excelente notícia para você: a análise de crédito da sua empresa foi concluída e o limite solicitado está pré-aprovado! 🎉

Identificamos que ainda não conseguimos falar com você para apresentar as condições e tirar dúvidas sobre a contratação.

Essa condição é válida por tempo limitado. Para falar diretamente com nossa equipe e dar andamento, clique no botão abaixo:

[ Falar Especialista ]`;

const TEMPLATE_REENGAJAMENTO_ID = 'ba5c8112-bd53-4608-bed6-4562cfca1834';
const TEMPLATE_REENGAJAMENTO_TEXT = 'Oi! Tudo bem? Conseguiu ver a mensagem que te mandei mais cedo?';

const FLOW_ID = '1135459742362876';

const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function postZenvia(payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: 'api.zenvia.com',
        path: '/v2/channels/whatsapp/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-TOKEN': ZENVIA_TOKEN,
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 15000
      },
      res => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data });
          } catch (e) {
            resolve({ ok: false, status: res.statusCode, error: raw });
          }
        });
      }
    );
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', err => resolve({ ok: false, error: err.message }));
    req.write(body);
    req.end();
  });
}

async function sendItem(item) {
  if (item.mode === 'template_aprovados') {
    const res = await postZenvia({
      from: ZENVIA_CHANNEL,
      to: item.phone,
      contents: [{ type: 'template', templateId: TEMPLATE_APROVADOS_ID, fields: {} }]
    });
    return { ...res, messageType: 'template', content: TEMPLATE_APROVADOS_TEXT, templateId: TEMPLATE_APROVADOS_ID };
  }

  if (item.mode === 'flow_24h') {
    const bodyText = `Olá! Vi que você iniciou sua solicitação de crédito Ticket, mas faltou concluir a simulação.\n\nClique no botão abaixo para preencher rapidinho ou me informe por aqui o valor desejado para sua empresa:`;
    const res = await postZenvia({
      from: ZENVIA_CHANNEL,
      to: item.phone,
      contents: [
        {
          type: 'flow',
          header: 'Reforço de Caixa Ticket',
          body: bodyText,
          footer: 'Parceria Ticket & Fiserv',
          flow: {
            mode: 'published',
            token: `resgate_16nov_${Date.now()}`,
            id: FLOW_ID,
            buttonText: 'Simular Crédito',
            action: { type: 'navigate', screen: 'SIMULACAO_SCREEN' }
          }
        }
      ]
    });
    return { ...res, messageType: 'text', content: `${bodyText}\n\n[ Simular Crédito ]`, templateId: null };
  }

  // template_reengajamento
  const res = await postZenvia({
    from: ZENVIA_CHANNEL,
    to: item.phone,
    contents: [{ type: 'template', templateId: TEMPLATE_REENGAJAMENTO_ID, fields: {} }]
  });
  return { ...res, messageType: 'template', content: TEMPLATE_REENGAJAMENTO_TEXT, templateId: TEMPLATE_REENGAJAMENTO_ID };
}

async function run() {
  const startTime = new Date();
  console.log('='.repeat(75));
  console.log(`🚀 DISPARO EM MASSA 16/NOV (REAQUECIMENTO + CONTINUAÇÃO + REENGAJAMENTO)`);
  console.log(`⏰ Início: ${startTime.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  console.log(`🛡 Modo: ${IS_DRY_RUN ? 'DRY-RUN (Simulação)' : 'PRODUÇÃO (Envio Real)'}`);
  console.log('='.repeat(75));

  // 1. Buscar campanhas
  const { data: camps, error: campErr } = await supabase
    .from('campaigns')
    .select('id, name');
  if (campErr) throw campErr;

  const campMap = {};
  camps.forEach(c => campMap[c.id] = c.name);

  const targetCampNames = [
    '16/nov_leads maior propensão',
    '13/nov_leads maior propensão',
    '12/nov_leads maior propensão',
    '11/nov_leads maior propensão',
    '10/nov_leads maior propensão',
    '09/nov_leads maior propensão'
  ];
  const recentCampIds = camps.filter(c => targetCampNames.includes(c.name)).map(c => c.id);
  const todayCampId = camps.find(c => c.name === '16/nov_leads maior propensão')?.id;
  const allOctNovCampIds = camps.filter(c => c.name.includes('/nov') || c.name.includes('/out')).map(c => c.id);

  // 2. Buscar todos os aprovados recentes/históricos (out/nov)
  const { data: approvedRaw } = await supabase
    .from('agent_leads')
    .select('id, name, whatsapp, campaign_id, status, metadata, created_at')
    .in('campaign_id', allOctNovCampIds)
    .or('metadata->>fiserv_status.in.(approved,comite_approved),status.in.(approved,aprovado),metadata->>fiserv_is_approved.eq.true');

  // 3. Buscar outbound_queue e agent_leads das campanhas de 09-16/nov
  const { data: oqList } = await supabase
    .from('outbound_queue')
    .select('id, campaign_id, contact_phone, contact_name, status, response_detected, reengagement_attempt_count, metadata')
    .in('campaign_id', recentCampIds);

  const { data: alList } = await supabase
    .from('agent_leads')
    .select('id, campaign_id, whatsapp, name, status, metadata')
    .in('campaign_id', recentCampIds);

  const alByKey = new Map();
  (alList || []).forEach(l => {
    const p = normalizePhone(l.whatsapp);
    if (p) alByKey.set(`${l.campaign_id}_${p}`, l);
  });

  // Coletar todos os telefones envolvidos para checar atendimento humano em lote
  const phoneSet = new Set();
  (approvedRaw || []).forEach(l => { const p = normalizePhone(l.whatsapp); if (p) phoneSet.add(p); });
  (oqList || []).forEach(q => { const p = normalizePhone(q.contact_phone); if (p) phoneSet.add(p); });

  const allPhones = Array.from(phoneSet);
  const allVariants = [];
  allPhones.forEach(p => {
    allVariants.push(p);
    if (p.startsWith('55')) allVariants.push(p.slice(2));
  });

  // Buscar conversas em blocos de 500
  const convMap = {};
  const convIds = [];
  for (let i = 0; i < allVariants.length; i += 500) {
    const chunk = allVariants.slice(i, i + 500);
    const { data: convs } = await supabase
      .from('conversations')
      .select('id, user_identifier, status, assigned_operator_id, agent_id')
      .in('user_identifier', chunk);
    (convs || []).forEach(c => {
      convMap[c.user_identifier] = c;
      convIds.push(c.id);
    });
  }

  // Buscar mensagens humanas em blocos de 300
  const humanConvIds = new Set();
  for (let i = 0; i < convIds.length; i += 300) {
    const chunk = convIds.slice(i, i + 300);
    const { data: hMsgs } = await supabase
      .from('messages')
      .select('conversation_id')
      .in('conversation_id', chunk)
      .or('sender_type.ilike.%human%,sender_type.ilike.%operator%,content.ilike.%assumiu a conversa%');
    (hMsgs || []).forEach(m => humanConvIds.add(m.conversation_id));
  }

  function getConvAndHuman(phone) {
    const variants = [phone, phone.startsWith('55') ? phone.slice(2) : phone];
    let conv = null;
    for (const v of variants) {
      if (convMap[v]) { conv = convMap[v]; break; }
    }
    const hasHuman = Boolean(
      conv && (conv.assigned_operator_id || conv.status === 'human_active' || humanConvIds.has(conv.id))
    );
    return { conv, hasHuman };
  }

  const scheduledPhones = new Set(['5511975870049']); // Excluir Toninho (já no Cockpit aguardando humano)
  const queueItems = [];

  // LOTE 1: Aprovados sem atendimento humano e sem formalização
  for (const al of (approvedRaw || [])) {
    const phone = normalizePhone(al.whatsapp);
    if (!phone || scheduledPhones.has(phone)) continue;

    const isLost = (al.metadata?.lost_reason) != null
      || ['lost', 'cancelled', 'declined', 'recusado', 'desistente'].includes((al.metadata?.formalization_status || '').toLowerCase())
      || ['denied', 'fails_to_process', 'lost', 'cancelled', 'recusado', 'reprovado', 'declined'].includes((al.metadata?.fiserv_status || '').toLowerCase())
      || ['denied', 'recusado', 'reprovado'].includes((al.status || '').toLowerCase());
    if (isLost) continue;

    const isFormalized = al.metadata?.simulation_accepted === true
      || al.metadata?.ok_agente === true
      || al.metadata?.formalization_status === 'completed';
    if (isFormalized) continue;

    const { conv, hasHuman } = getConvAndHuman(phone);
    if (hasHuman) continue;

    scheduledPhones.add(phone);
    queueItems.push({
      group: '1_reaquecimento_aprovados',
      mode: 'template_aprovados',
      phone,
      name: al.name || 'Cliente',
      campaignId: al.campaign_id,
      campaignName: campMap[al.campaign_id] || 'Campanha',
      oqId: null,
      conv
    });
  }

  // LOTES 2, 3 e 4: Continuação de Conversa (hoje e semana passada) + Reengajamento (Lidos s/ resposta semana passada)
  for (const q of (oqList || [])) {
    const phone = normalizePhone(q.contact_phone);
    if (!phone || scheduledPhones.has(phone)) continue;

    const lead = alByKey.get(`${q.campaign_id}_${phone}`);
    const meta = lead?.metadata || {};

    const hasOptIn = Boolean(meta.opt_in || meta.optin || meta.consent?.opt_in || meta.loan_request_id);
    const isLost = Boolean(meta.lost_reason)
      || ['denied', 'lost', 'cancelled', 'fails_to_process', 'recusado', 'reprovado'].includes((meta.fiserv_status || '').toLowerCase());
    if (hasOptIn || isLost) continue;

    const { conv, hasHuman } = getConvAndHuman(phone);
    if (hasHuman) continue;

    const hasInteracted = Boolean(q.response_detected || q.metadata?.responded || meta.identity_confirmed || meta.cnpj_confirmed);

    if (hasInteracted) {
      scheduledPhones.add(phone);
      if (q.campaign_id === todayCampId) {
        queueItems.push({
          group: '2_continuacao_hoje_24h',
          mode: 'flow_24h',
          phone,
          name: lead?.name || q.contact_name || 'Cliente',
          campaignId: q.campaign_id,
          campaignName: campMap[q.campaign_id],
          oqId: q.id,
          oqMeta: q.metadata || {},
          reengagementCount: q.reengagement_attempt_count || 0,
          conv
        });
      } else {
        queueItems.push({
          group: '3_continuacao_semana_passada',
          mode: 'template_reengajamento',
          phone,
          name: lead?.name || q.contact_name || 'Cliente',
          campaignId: q.campaign_id,
          campaignName: campMap[q.campaign_id],
          oqId: q.id,
          oqMeta: q.metadata || {},
          reengagementCount: q.reengagement_attempt_count || 0,
          conv
        });
      }
    } else if (q.status === 'read' && q.campaign_id !== todayCampId) {
      scheduledPhones.add(phone);
      queueItems.push({
        group: '4_reengajamento_lidos_semana_passada',
        mode: 'template_reengajamento',
        phone,
        name: lead?.name || q.contact_name || 'Cliente',
        campaignId: q.campaign_id,
        campaignName: campMap[q.campaign_id],
        oqId: q.id,
        oqMeta: q.metadata || {},
        reengagementCount: q.reengagement_attempt_count || 0,
        conv
      });
    }
  }

  const counts = queueItems.reduce((acc, item) => {
    acc[item.group] = (acc[item.group] || 0) + 1;
    return acc;
  }, {});

  console.log('\n📊 RESUMO DOS LOTES DEDUPLICADOS:');
  console.log(`   1. Reaquecimento Aprovados (sem humano):     ${counts['1_reaquecimento_aprovados'] || 0}`);
  console.log(`   2. Continuação de Conversa Hoje (Flow 24h):  ${counts['2_continuacao_hoje_24h'] || 0}`);
  console.log(`   3. Continuação Semana Passada (Template):    ${counts['3_continuacao_semana_passada'] || 0}`);
  console.log(`   4. Reengajamento Lidos Sem. Passada (Templ): ${counts['4_reengajamento_lidos_semana_passada'] || 0}`);
  console.log(`   -------------------------------------------------`);
  console.log(`   🎯 TOTAL GERAL A DISPARAR:                   ${queueItems.length}`);

  if (IS_DRY_RUN) {
    console.log('\n✅ DRY-RUN concluído. Nenhum disparo real efetuado.');
    return;
  }

  let sentOk = 0;
  let sentErr = 0;

  for (let i = 0; i < queueItems.length; i++) {
    const item = queueItems[i];
    const res = await sendItem(item);

    if (res.ok) {
      sentOk++;
      const zenviaMsgId = res.data?.id || null;
      if (i < 15 || (i + 1) % 50 === 0 || item.group !== '4_reengajamento_lidos_semana_passada') {
        console.log(`[${i + 1}/${queueItems.length}] ✅ [${item.group}] ${item.name} (${item.phone}) -> ${zenviaMsgId}`);
      }

      // Garantir conversa e registrar mensagem no chat
      let convId = item.conv?.id;
      const agentId = item.conv?.agent_id || AGENT_ID;

      if (!convId) {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({
            tenant_id: TENANT_ID,
            agent_id: agentId,
            user_identifier: item.phone,
            user_name: item.name,
            channel: 'whatsapp',
            status: 'ai_active',
            campaign_id: item.campaignId,
            last_message_at: new Date().toISOString()
          })
          .select('id')
          .single();
        if (newConv) convId = newConv.id;
      } else {
        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', convId);
      }

      if (convId) {
        await supabase.from('messages').insert({
          conversation_id: convId,
          tenant_id: TENANT_ID,
          sender_type: item.mode === 'flow_24h' ? 'ai' : 'system',
          sender_name: item.mode === 'flow_24h' ? 'IA' : null,
          direction: 'outbound',
          message_type: res.messageType,
          content: res.content,
          remote_id: zenviaMsgId,
          status: 'sent',
          metadata: {
            template_id: res.templateId,
            is_reengagement: true,
            is_approved_reengagement: item.group === '1_reaquecimento_aprovados',
            action: item.group
          }
        });
      }

      if (item.oqId) {
        await supabase
          .from('outbound_queue')
          .update({
            reengagement_attempt_count: (item.reengagementCount || 0) + 1,
            reengagement_last_sent_at: new Date().toISOString(),
            metadata: {
              ...(item.oqMeta || {}),
              is_reengagement: true,
              reengagement_group: item.group
            }
          })
          .eq('id', item.oqId);
      }

      if (res.templateId) {
        try {
          await supabase.from('wa_billing_windows').insert({
            tenant_id: TENANT_ID,
            agent_id: agentId,
            contact_phone: item.phone,
            window_type: 'marketing',
            status: 'open',
            window_started_at: new Date().toISOString(),
            window_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            metadata: {
              campaign_id: item.campaignId,
              is_reengagement: true,
              template_id: res.templateId
            }
          });
        } catch (_) {}
      }
    } else {
      sentErr++;
      console.error(`[${i + 1}/${queueItems.length}] ❌ [${item.group}] ${item.phone}:`, res.data || res.error);
    }

    await sleep(750);
  }

  console.log('\n' + '='.repeat(75));
  console.log(`🏁 DISPARO EM MASSA FINALIZADO!`);
  console.log(`✅ Enviados com sucesso: ${sentOk}`);
  console.log(`❌ Falhas: ${sentErr}`);
  console.log(`⏱ Duração: ${((new Date() - startTime) / 60000).toFixed(1)} min`);
  console.log('='.repeat(75));
}

run().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});

