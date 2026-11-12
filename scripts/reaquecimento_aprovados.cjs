/**
 * ROTINA INTEGRADA: REAQUECIMENTO DE LEADS APROVADOS FISERV
 * 
 * Regra de Negócio:
 * 1. Identifica campanhas ativas onde `reengagement_enabled = true` e
 *    `metadata->>'reengagement_approved_enabled' = 'true'`.
 * 2. Seleciona leads da campanha que:
 *    - Tiveram aprovação de crédito na Fiserv (`fiserv_status` in 'approved', 'comite_approved' ou `fiserv_is_approved = true`).
 *    - Enviados há pelo menos `reengagement_wait_hours` (padrão 24h).
 *    - Não receberam mensagens de operador humano e não estão com operador atribuído.
 *    - Não deram OK nem estão formalizados (`ok_agente != true`, `simulation_accepted != true`).
 *    - Respeitam a quantidade máxima de voltas (`reengagement_max_attempts`).
 * 3. Envia via Template Oficial HSM (padrão com botão único: "Falar com um agente")
 *    registrando consumo na tabela wa_billing_windows e atualizando o contador em outbound_queue.
 * 
 * Uso:
 *   node scripts/reaquecimento_aprovados.cjs --dry-run
 *   node scripts/reaquecimento_aprovados.cjs --campaign-id=<ID>
 *   node scripts/reaquecimento_aprovados.cjs (executa em todas as campanhas elegíveis)
 */

const { createClient } = require('@supabase/supabase-js');

// Configurações
const SUPABASE_URL = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const TENANT_ID = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
const ZENVIA_CHANNEL = '551151183815';

// Template Oficial Padrão (Fiserv - Aprovados sem sucesso no contato)
// Possui botão único: [ Falar com um agente ]
const DEFAULT_APPROVED_TEMPLATE_ID = '9084129b-8031-4af4-82be-71ce8c26637a';
const DEFAULT_APPROVED_MESSAGE = `Olá estabelecimento!

A Ticket tem uma *boa notícia* para você: *seu crédito foi liberado* e pode ser usado agora mesmo!

Sua análise foi concluída e você possui um *valor pré-aprovado* para o seu CNPJ, mas ainda *não conseguimos falar com você* para te passar mais detalhes. 

Essa condição é *válida por tempo limitado,* fale agora com um de nossos agentes para dar continuidade na sua solicitação.`;

// Argumentos CLI
const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');
const CAMPAIGN_ARG = args.find(a => a.startsWith('--campaign-id='));
const TARGET_CAMPAIGN_ID = CAMPAIGN_ARG ? CAMPAIGN_ARG.split('=')[1] : null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanPhone(raw) {
  if (!raw) return '';
  return raw.replace(/\D/g, '');
}

async function sendZenviaTemplate(zenviaToken, toPhone, templateId) {
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
        templateId: templateId,
        fields: {}
      }
    ]
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(zenviaUrl, {
        method: 'POST',
        headers: {
          'X-API-TOKEN': zenviaToken,
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
      if (attempt < 3) {
        await sleep(1500);
      } else {
        return { ok: false, status: 0, error: err.message };
      }
    }
  }
}

async function run() {
  console.log('='.repeat(70));
  console.log('🚀 INICIANDO ROTINA DE REAQUECIMENTO DE LEADS APROVADOS (FISERV)');
  console.log(`Modo: ${IS_DRY_RUN ? '🔍 DRY RUN (Simulação)' : '⚡ LIVE (Envio Real)'}`);
  console.log('='.repeat(70));

  // 1. Buscar token do agente comercial oficial
  const { data: agent, error: agErr } = await supabase
    .from('agents')
    .select('id, name, zenvia_api_token, zenvia_channel_id')
    .eq('id', '0290cece-beef-4b3b-84c6-bf4d53851a96')
    .single();

  if (agErr || !agent?.zenvia_api_token) {
    console.error('❌ Erro ao obter credenciais do Agente Fiserv:', agErr);
    process.exit(1);
  }

  const ZENVIA_TOKEN = agent.zenvia_api_token;

  // 2. Buscar campanhas elegíveis
  let campQuery = supabase
    .from('campaigns')
    .select('id, name, reengagement_enabled, reengagement_wait_hours, reengagement_max_attempts, reengagement_template_id, metadata')
    .eq('tenant_id', TENANT_ID);

  if (TARGET_CAMPAIGN_ID) {
    campQuery = campQuery.eq('id', TARGET_CAMPAIGN_ID);
  }

  const { data: campaigns, error: campErr } = await campQuery;
  if (campErr || !campaigns || campaigns.length === 0) {
    console.log('Nenhuma campanha encontrada.');
    return;
  }

  // Filtrar campanhas onde o reengajamento de aprovados está ativo
  const eligibleCampaigns = campaigns.filter(c => {
    return c.reengagement_enabled === true && c.metadata?.reengagement_approved_enabled === true;
  });

  console.log(`Total de campanhas cadastradas: ${campaigns.length}`);
  console.log(`Campanhas com Reaquecimento de Aprovados ATIVO: ${eligibleCampaigns.length}\n`);

  if (eligibleCampaigns.length === 0) {
    console.log('Nenhuma campanha está com reengagement_approved_enabled = true no momento.');
    console.log('Dica: Ative a opção na tela de edição da campanha em "Reaquecer Aprovados sem Atendimento Humano".');
    return;
  }

  let totalDispatched = 0;
  let totalSkipped = 0;

  for (const camp of eligibleCampaigns) {
    const waitHours = camp.reengagement_wait_hours || 24;
    const maxAttempts = camp.reengagement_max_attempts || 1;
    const cutoffDate = new Date(Date.now() - waitHours * 3600 * 1000).toISOString();
    
    // Template configurado ou fallback para o oficial
    const templateId = camp.metadata?.reengagement_approved_template_id || DEFAULT_APPROVED_TEMPLATE_ID;
    const messageText = camp.metadata?.reengagement_approved_message || DEFAULT_APPROVED_MESSAGE;

    console.log(`📌 Processando Campanha: "${camp.name}" (${camp.id})`);
    console.log(`   - Horas de espera: ${waitHours}h (Limite de envio anterior a: ${cutoffDate})`);
    console.log(`   - Max Voltas: ${maxAttempts}x | Template ID: ${templateId}`);

    // Buscar leads da campanha que estão Aprovados
    const { data: leads, error: leadErr } = await supabase
      .from('agent_leads')
      .select('id, name, whatsapp, metadata, created_at')
      .eq('campaign_id', camp.id);

    if (leadErr || !leads) {
      console.error('   ❌ Erro ao buscar leads da campanha:', leadErr);
      continue;
    }

    // Filtrar apenas comite_approved / approved
    const approvedLeads = leads.filter(l => {
      const m = l.metadata || {};
      const fs = (m.fiserv_status || '').toLowerCase();
      const isApproved = fs === 'approved' || fs === 'comite_approved' || fs === 'aprovado' || m.fiserv_is_approved === true;
      const isDeniedOrLost = ['denied', 'lost', 'cancelled', 'recusado', 'reprovado'].includes(fs) || !!m.lost_reason;
      const hasAccepted = m.ok_agente === true || m.simulation_accepted === true || !!m.accepted_proposal;
      return isApproved && !isDeniedOrLost && !hasAccepted;
    });

    console.log(`   - Total leads aprovados pendentes de formalização: ${approvedLeads.length}`);

    for (const lead of approvedLeads) {
      const phone = cleanPhone(lead.whatsapp);
      if (!phone) continue;

      // Verificar registro no outbound_queue para respeitar tempo e voltas
      const { data: queueItems } = await supabase
        .from('outbound_queue')
        .select('id, status, sent_at, reengagement_attempt_count, reengagement_last_sent_at, conversation_id')
        .eq('campaign_id', camp.id)
        .eq('contact_phone', phone)
        .order('created_at', { ascending: false })
        .limit(1);

      const queue = queueItems?.[0];
      if (!queue) {
        continue;
      }

      // Trava 1: Se já atingiu o máximo de voltas
      const attempts = queue.reengagement_attempt_count || 0;
      if (attempts >= maxAttempts) {
        totalSkipped++;
        continue;
      }

      // Trava 2: Se foi enviado há menos de waitHours
      const lastSentTime = queue.reengagement_last_sent_at || queue.sent_at;
      if (lastSentTime && new Date(lastSentTime) > new Date(cutoffDate)) {
        totalSkipped++;
        continue;
      }

      // Trava 3: Verificar se foi contactado por humano na conversa
      const phoneVariants = [phone, '55' + phone, phone.slice(-11), '55' + phone.slice(-11)];
      const { data: convs } = await supabase
        .from('conversations')
        .select('id, status, assigned_operator_id')
        .in('user_identifier', phoneVariants)
        .limit(1);

      let contactedByHuman = false;
      let convId = queue.conversation_id;

      if (convs && convs.length > 0) {
        convId = convs[0].id;
        if (convs[0].assigned_operator_id || convs[0].status === 'human_active') {
          contactedByHuman = true;
        } else {
          // Verificar mensagens
          const { data: msgs } = await supabase
            .from('messages')
            .select('sender_type, sender_name, content')
            .eq('conversation_id', convs[0].id)
            .limit(50);

          if (msgs) {
            contactedByHuman = msgs.some(m => {
              const c = m.content || '';
              return c.includes('assumiu a conversa') || ['operator', 'human'].includes((m.sender_type || '').toLowerCase());
            });
          }
        }
      }

      if (contactedByHuman) {
        totalSkipped++;
        continue;
      }

      // 4. Executar Disparo de Reaquecimento
      console.log(`   👉 Disparando para ${lead.name} (${phone}) [Tentativa ${attempts + 1}/${maxAttempts}]...`);

      const res = await sendZenviaTemplate(ZENVIA_TOKEN, phone, templateId);
      if (!res.ok) {
        console.error(`      ❌ Erro no envio Zenvia para ${phone}:`, res.data || res.error);
        continue;
      }

      console.log(`      ✅ Sucesso Zenvia! (Status: ${res.status})`);
      totalDispatched++;

      if (!IS_DRY_RUN) {
        // Atualizar outbound_queue
        await supabase
          .from('outbound_queue')
          .update({
            reengagement_attempt_count: attempts + 1,
            reengagement_last_sent_at: new Date().toISOString(),
            status: 'sent',
            metadata: {
              ...(queue.metadata || {}),
              is_reengagement: true,
              is_approved_reengagement: true,
              reengagement_template_id: templateId
            }
          })
          .eq('id', queue.id);

        // Se houver conversa, registrar a mensagem no chat
        if (convId) {
          await supabase.from('messages').insert({
            conversation_id: convId,
            tenant_id: TENANT_ID,
            sender_type: 'system',
            direction: 'outbound',
            message_type: 'template',
            content: messageText,
            status: 'sent',
            metadata: {
              template_id: templateId,
              is_approved_reengagement: true
            }
          });
        }

        // Registrar janela de faturamento
        try {
          await supabase.from('wa_billing_windows').insert({
            tenant_id: TENANT_ID,
            agent_id: agent.id,
            contact_phone: phone,
            window_type: 'marketing',
            status: 'open',
            window_started_at: new Date().toISOString(),
            window_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            metadata: {
              campaign_id: camp.id,
              is_reengagement: true,
              is_approved_reengagement: true,
              template_id: templateId
            }
          });
        } catch (e) {
          // Ignorar se já houver janela aberta
        }
      }

      await sleep(1000); // Cadência preventiva de 1 seg
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`🏁 FINALIZADO!`);
  console.log(`Total disparados com sucesso: ${totalDispatched}`);
  console.log(`Total ignorados (fora do prazo / já contactados / já atingiram voltas): ${totalSkipped}`);
  console.log('='.repeat(70));
}

run();

