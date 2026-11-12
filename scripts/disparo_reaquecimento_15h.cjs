/**
 * ROTINA EXCLUSIVA: REAQUECIMENTO DE LEADS APROVADOS FISERV (15:00)
 * 
 * Filtros Rigorosos:
 * 1. Base: Campanhas anteriores (exclui 12/nov, que é a de hoje).
 * 2. Status Fiserv: Aprovados / Pré-aprovados sem descarte/recusa.
 * 3. Status Formalização: Não deram OK e não estão formalizados.
 * 4. Atendimento Humano: NÃO foram abordados por humanos (nem mensagens nem operadores atribuídos).
 * 5. Template: 8ea3c2b0-5f3b-4ef4-895a-5f8b54524622 (aprovado na Meta)
 * 6. Registra no banco de dados para sincronizar no chat e no painel em tempo real.
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const fs = require('fs');

const SUPABASE_URL = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const TENANT_ID = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
const ZENVIA_CHANNEL = '551151183815';
const ZENVIA_TOKEN = 'RzWJ6TUddARV5tgPEqyk9qTS8af5WnXQutg7';

const TEMPLATE_ID = '8ea3c2b0-5f3b-4ef4-895a-5f8b54524622';
const TEMPLATE_BODY = `Olá! A Ticket tem uma excelente notícia para você: a análise de crédito da sua empresa foi concluída e o limite solicitado está pré-aprovado! 🎉

Identificamos que ainda não conseguimos falar com você para apresentar as condições e tirar dúvidas sobre a contratação.

Essa condição é válida por tempo limitado. Para falar diretamente com nossa equipe e dar andamento, clique no botão abaixo:

[ Falar Especialista ]`;

const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendZenviaTemplate(phone) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      from: ZENVIA_CHANNEL,
      to: phone,
      contents: [
        {
          type: 'template',
          templateId: TEMPLATE_ID,
          fields: {}
        }
      ]
    });

    const req = https.request(
      {
        hostname: 'api.zenvia.com',
        path: '/v2/channels/whatsapp/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-TOKEN': ZENVIA_TOKEN,
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      res => {
        let responseBody = '';
        res.on('data', chunk => responseBody += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(responseBody);
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data });
          } catch (e) {
            resolve({ ok: false, status: res.statusCode, error: responseBody });
          }
        });
      }
    );

    req.on('error', err => resolve({ ok: false, error: err.message }));
    req.write(payload);
    req.end();
  });
}

async function run() {
  const startTime = new Date();
  console.log('='.repeat(75));
  console.log(`🚀 INICIANDO ROTINA DE REAQUECIMENTO DE LEADS APROVADOS (15:00)`);
  console.log(`⏰ Data/Hora: ${startTime.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  console.log(`🛡 Modo: ${IS_DRY_RUN ? 'DRY-RUN (Simulação)' : 'PRODUÇÃO (Envio Real)'}`);
  console.log(`📋 Template ID: ${TEMPLATE_ID}`);
  console.log('='.repeat(75));

  // 1. Obter campanhas
  const { data: camps, error: campErr } = await supabase.from('campaigns').select('id, name');
  if (campErr) {
    console.error('Erro ao listar campanhas:', campErr);
    return;
  }

  const campMap = {};
  camps.forEach(c => campMap[c.id] = c.name);

  // Excluir expressamente a campanha de hoje (12/nov)
  const eligibleCampIds = camps
    .filter(c => c.name.includes('/nov') || c.name.includes('/out'))
    .filter(c => c.id !== 'aa21dc2f-33ec-4b7a-8e6c-888b60454bfc')
    .map(c => c.id);

  console.log(`📌 Campanhas elegíveis analisadas: ${eligibleCampIds.length}`);

  // 2. Buscar leads aprovados
  const { data: leads, error: leadErr } = await supabase
    .from('agent_leads')
    .select('id, name, whatsapp, campaign_id, status, metadata, created_at')
    .in('campaign_id', eligibleCampIds)
    .or('metadata->>fiserv_status.in.(approved,comite_approved),status.in.(approved,aprovado),metadata->>fiserv_is_approved.eq.true');

  if (leadErr) {
    console.error('Erro ao buscar leads:', leadErr);
    return;
  }

  // Filtrar conforme regras oficiais da RPC
  const approved = (leads || []).filter(al => {
    const isLost = (al.metadata?.lost_reason) != null
      || ['lost', 'cancelled', 'declined', 'recusado', 'desistente'].includes((al.metadata?.formalization_status || '').toLowerCase())
      || ['denied', 'fails_to_process', 'lost', 'cancelled', 'recusado', 'reprovado', 'declined'].includes((al.metadata?.fiserv_status || '').toLowerCase())
      || ['denied', 'recusado', 'reprovado'].includes((al.status || '').toLowerCase())
      || (al.metadata?.fiserv_external_status || '').toLowerCase().includes('não conseguimos')
      || (al.metadata?.fiserv_external_status || '').toLowerCase().includes('nao conseguimos')
      || (al.metadata?.fiserv_external_status || '').toLowerCase().includes('reprovad')
      || (al.metadata?.fiserv_external_status || '').toLowerCase().includes('recusad');

    return !isLost;
  });

  // Deduplicar por telefone normalizado
  const uniqueByPhone = new Map();
  approved.forEach(l => {
    const raw = l.whatsapp.replace(/\D/g, '');
    if (!uniqueByPhone.has(raw)) {
      uniqueByPhone.set(raw, l);
    }
  });

  const uniqueList = Array.from(uniqueByPhone.values());
  console.log(`👥 Total de leads únicos aprovados encontrados: ${uniqueList.length}`);

  // 3. Montar variantes telefônicas e consultar conversas
  const allVariants = [];
  uniqueList.forEach(l => {
    const p = l.whatsapp.replace(/\D/g, '');
    allVariants.push(p);
    if (p.startsWith('55')) allVariants.push(p.slice(2));
    else allVariants.push(`55${p}`);
  });

  const { data: convs } = await supabase
    .from('conversations')
    .select('id, user_identifier, status, assigned_operator_id, agent_id')
    .in('user_identifier', allVariants);

  const convMap = {};
  (convs || []).forEach(c => convMap[c.user_identifier] = c);

  // 4. Identificar intervenções humanas
  const convIds = (convs || []).map(c => c.id);
  const { data: humanMsgs } = await supabase
    .from('messages')
    .select('conversation_id, sender_type, sender_name, content')
    .in('conversation_id', convIds)
    .or('sender_type.ilike.%human%,sender_type.ilike.%operator%,content.ilike.%assumiu a conversa%');

  const humanConvIds = new Set((humanMsgs || []).map(m => m.conversation_id));

  // 5. Separar lista final elegível
  const targetLeads = [];
  for (const l of uniqueList) {
    const p = l.whatsapp.replace(/\D/g, '');
    const variants = [p, p.startsWith('55') ? p.slice(2) : `55${p}`];
    let conv = null;
    for (const v of variants) {
      if (convMap[v]) {
        conv = convMap[v];
        break;
      }
    }

    const hasHuman = conv && (
      conv.assigned_operator_id ||
      conv.status === 'human_active' ||
      humanConvIds.has(conv.id)
    );

    const isFormalized = l.metadata?.simulation_accepted === true
      || l.metadata?.ok_agente === true
      || l.metadata?.formalization_status === 'completed';

    if (!hasHuman && !isFormalized) {
      targetLeads.push({ lead: l, conv });
    }
  }

  console.log(`\n🎯 Leads prontos para envio: ${targetLeads.length}`);
  console.log('-'.repeat(75));

  let dispatched = 0;
  let failed = 0;

  for (let i = 0; i < targetLeads.length; i++) {
    const { lead, conv } = targetLeads[i];
    const phone = lead.whatsapp.replace(/\D/g, '');
    const formattedPhone = phone.startsWith('55') ? phone : `55${phone}`;
    const leadCampName = campMap[lead.campaign_id] || 'Campanha Desconhecida';

    console.log(`[${i + 1}/${targetLeads.length}] Enviando para: ${lead.name} (${formattedPhone}) - [${leadCampName}]`);

    if (IS_DRY_RUN) {
      console.log(`   (Simulado - Mensagem não disparada)`);
      dispatched++;
      continue;
    }

    // Envio real Zenvia
    const res = await sendZenviaTemplate(formattedPhone);

    if (res.ok) {
      dispatched++;
      const zenviaMsgId = res.data?.id || null;
      console.log(`   ✅ Envio com sucesso! Zenvia MsgId: ${zenviaMsgId}`);

      // Resolver ou criar conversa para aparecer no LiveChat
      let convId = conv?.id;
      let agentId = conv?.agent_id || '0290cece-beef-4b3b-84c6-bf4d53851a96'; // Agente Fiserv

      if (!convId) {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({
            tenant_id: TENANT_ID,
            agent_id: agentId,
            user_identifier: formattedPhone,
            user_name: lead.name,
            channel: 'whatsapp',
            status: 'ai_active',
            campaign_id: lead.campaign_id,
            last_message_at: new Date().toISOString()
          })
          .select()
          .single();

        if (newConv) convId = newConv.id;
      } else {
        await supabase
          .from('conversations')
          .update({
            last_message_at: new Date().toISOString(),
            status: 'ai_active'
          })
          .eq('id', convId);
      }

      // Inserir mensagem na tabela 'messages' para renderizar no LiveChat
      if (convId) {
        await supabase.from('messages').insert({
          conversation_id: convId,
          tenant_id: TENANT_ID,
          sender_type: 'system',
          direction: 'outbound',
          message_type: 'template',
          content: TEMPLATE_BODY,
          remote_id: zenviaMsgId,
          status: 'sent',
          metadata: {
            template_id: TEMPLATE_ID,
            template_name: 'reaquecimento_credito_aprovado_v1',
            is_approved_reengagement: true,
            action: 'batch_15h_reengagement'
          }
        });
      }

      // Atualizar contadores em outbound_queue se existir registro
      await supabase
        .from('outbound_queue')
        .update({
          reengagement_last_sent_at: new Date().toISOString(),
          metadata: {
            is_reengagement: true,
            is_approved_reengagement: true,
            reengagement_template_id: TEMPLATE_ID
          }
        })
        .eq('campaign_id', lead.campaign_id)
        .eq('contact_phone', formattedPhone);

      // Registrar janela oficial de faturamento
      try {
        await supabase.from('wa_billing_windows').insert({
          tenant_id: TENANT_ID,
          agent_id: agentId,
          contact_phone: formattedPhone,
          window_type: 'marketing',
          status: 'open',
          window_started_at: new Date().toISOString(),
          window_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          metadata: {
            campaign_id: lead.campaign_id,
            is_reengagement: true,
            is_approved_reengagement: true,
            template_id: TEMPLATE_ID
          }
        });
      } catch (e) {
        // Ignora duplicação de janela aberta
      }

    } else {
      failed++;
      console.error(`   ❌ Falha no envio para ${formattedPhone}:`, res.data || res.error);
    }

    // Cadência suave de 1,2s entre disparos
    await sleep(1200);
  }

  console.log('\n' + '='.repeat(75));
  console.log(`🏁 DISPARO CONCLUÍDO!`);
  console.log(`✅ Sucesso: ${dispatched}`);
  console.log(`❌ Falhas: ${failed}`);
  console.log(`⏱ Duração: ${((new Date() - startTime) / 1000).toFixed(1)} segundos`);
  console.log('='.repeat(75));
}

run();

