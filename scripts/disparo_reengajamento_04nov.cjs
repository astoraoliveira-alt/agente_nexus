/**
 * DISPARO DE REENGAJAMENTO - CAMPANHA 04/NOV
 * 
 * Segmentos:
 * 1. IMEDIATO (AGORA):
 *    - Grupo 1: Leads que leram a mensagem (read) sem interagir/concluir formulário.
 *    - Grupo 3: Leads com auto-replies / bots de ausência que não avançaram no funil.
 *    - Total estimado: ~310 leads.
 * 
 * 2. AGENDADO (16:00):
 *    - Grupo 2: Leads entregues (delivered) que ainda não abriram/leram a mensagem.
 *    - Total estimado: ~320 leads.
 * 
 * Template:
 *    - Template Oficial Black Friday (ID: 7f109fd6-f6ad-4f4c-926b-2e8403f68647)
 *    - Imagem do banner Black Friday
 *    - Botão oficial de simulação [ Solicitar análise ]
 * 
 * Uso:
 *   node scripts/disparo_reengajamento_04nov.cjs --now               (Executa Grupo 1 + Grupo 3 agora)
 *   node scripts/disparo_reengajamento_04nov.cjs --schedule-16h      (Aguarda até as 16:00 e dispara o Grupo 2)
 *   node scripts/disparo_reengajamento_04nov.cjs --dry-run           (Simulação sem envio real)
 */

const { createClient } = require('@supabase/supabase-js');

// Configurações
const SUPABASE_URL = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const TENANT_ID = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
const CAMPAIGN_ID = '7cd3b043-7e8e-4f92-b6d9-30821c747d03'; // 04/nov_leads maior propensão_demais estados
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
const IS_SCHEDULE_16H = args.includes('--schedule-16h');

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

async function getSegmentedLeads() {
  const { data: queue, error: qErr } = await supabase
    .from('outbound_queue')
    .select('id, contact_phone, contact_name, status, response_detected, metadata, conversation_id, reengagement_attempt_count')
    .eq('campaign_id', CAMPAIGN_ID);

  if (qErr) {
    console.error('Erro ao buscar fila outbound:', qErr);
    return { nowLeads: [], laterLeads: [] };
  }

  const { data: agentLeads, error: alErr } = await supabase
    .from('agent_leads')
    .select('id, whatsapp, name, status, metadata')
    .eq('campaign_id', CAMPAIGN_ID);

  if (alErr) {
    console.error('Erro ao buscar agent_leads:', alErr);
    return { nowLeads: [], laterLeads: [] };
  }

  // Telefones rigorosamente excluídos (já converteram, deram opt-in, simularam, foram aprovados/recusados ou assumidos por atendente)
  const excludedPhones = new Set();
  agentLeads.forEach(al => {
    const meta = al.metadata || {};
    const hasConvertedOrAdvanced = Boolean(
      meta.opt_in ||
      meta.consent?.opt_in ||
      meta.simularam ||
      meta.button_clicked ||
      meta.fiserv_status ||
      meta.formalization_status === 'in_service' ||
      meta.operator_assigned_at ||
      ['approved', 'denied', 'recusado', 'aprovado'].includes(String(al.status || '').toLowerCase())
    );

    if (hasConvertedOrAdvanced) {
      excludedPhones.add(al.whatsapp);
      const clean = al.whatsapp.replace(/\D/g, '');
      excludedPhones.add(clean);
      if (clean.startsWith('55')) excludedPhones.add(clean.slice(2));
    }
  });

  const nowLeads = [];   // Grupo 1 (Lidas) + Grupo 3 (Auto-replies sem formulário)
  const laterLeads = []; // Grupo 2 (Entregues mas ainda não lidas)

  queue.forEach(q => {
    if (['not_delivered', 'failed'].includes(q.status)) return;

    const clean = q.contact_phone.replace(/\D/g, '');
    const isExcluded = (
      excludedPhones.has(q.contact_phone) ||
      excludedPhones.has(clean) ||
      (clean.startsWith('55') && excludedPhones.has(clean.slice(2)))
    );

    if (isExcluded) return;

    const isAutoReply = Boolean(q.metadata?.is_auto_reply || q.metadata?.is_bot);
    const isG1 = q.status === 'read' && !isAutoReply;
    const isG3 = isAutoReply || (q.response_detected && !isExcluded);
    const isG2 = q.status === 'delivered' && !isAutoReply && !q.response_detected;

    if (isG1 || isG3) {
      nowLeads.push(q);
    } else if (isG2) {
      laterLeads.push(q);
    }
  });

  return { nowLeads, laterLeads };
}

async function dispatchBatch(leads, batchLabel) {
  console.log(`\n=============================================================`);
  console.log(`🚀 INICIANDO DISPARO: ${batchLabel}`);
  console.log(`   - Total de leads aptos: ${leads.length}`);
  console.log(`   - Modo: ${IS_DRY_RUN ? 'SIMULAÇÃO (--dry-run)' : 'PRODUÇÃO REAL'}`);
  console.log(`=============================================================\n`);

  let successCount = 0;
  let failCount = 0;
  let skippedRecent = 0;

  for (let i = 0; i < leads.length; i++) {
    const item = leads[i];

    // Checagem de segurança: não enviar se recebeu mensagem da Sofia nos últimos 45 minutos
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
        // Atualiza contadores na outbound_queue
        await supabase.from('outbound_queue').update({
          reengagement_attempt_count: (item.reengagement_attempt_count || 0) + 1,
          reengagement_last_sent_at: nowIso,
          last_attempt_at: nowIso
        }).eq('id', item.id);

        // Registra o template integral no histórico da conversa para o operador e para o cliente
        if (item.conversation_id) {
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
      console.log(`  ❌ Falha [${i + 1}/${leads.length}] ${item.contact_phone}: HTTP ${res.status}`);
    }

    if ((i + 1) % 25 === 0 || i === leads.length - 1) {
      console.log(`  Progresso [${i + 1}/${leads.length}] Sucessos: ${successCount} | Falhas: ${failCount} | Pulados: ${skippedRecent}`);
    }

    await sleep(IS_DRY_RUN ? 0 : 350); // ~2.8 msgs/segundo para cadência suave na Zenvia
  }

  console.log(`\n=============================================================`);
  console.log(`✅ LOTE ${batchLabel} CONCLUÍDO!`);
  console.log(`   - Enviados com sucesso: ${successCount}/${leads.length}`);
  console.log(`   - Falhas: ${failCount}`);
  console.log(`   - Pulados recentemente: ${skippedRecent}`);
  console.log(`=============================================================\n`);
}

async function main() {
  const { nowLeads, laterLeads } = await getSegmentedLeads();

  console.log(`📊 MAPEAMENTO DA CAMPANHA 04/NOV:`);
  console.log(`   - Grupo 1 + Grupo 3 (Lidos e Auto-replies sem form): ${nowLeads.length} leads`);
  console.log(`   - Grupo 2 (Entregues mas ainda não lidos): ${laterLeads.length} leads`);

  if (IS_NOW) {
    await dispatchBatch(nowLeads, 'GRUPO 1 + GRUPO 3 (DISPARO IMEDIATO)');
  } else if (IS_SCHEDULE_16H) {
    const targetH = 16;
    const targetM = 0;
    console.log(`⏳ Agendador ativo para às 16:00 (horário de Brasília). Aguardando...`);

    function checkSchedule() {
      const now = new Date();
      const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const currentH = brTime.getHours();
      const currentM = brTime.getMinutes();
      const formattedNow = `${String(currentH).padStart(2, '0')}:${String(currentM).padStart(2, '0')}`;

      if (currentH > targetH || (currentH === targetH && currentM >= targetM)) {
        console.log(`\n⏰ [${formattedNow}] HORÁRIO ALVO (16:00) ATINGIDO! Iniciando execução do Grupo 2...`);
        // Recalcular lista no momento do envio para garantir que quem interagiu entre 12h e 16h seja preservado
        getSegmentedLeads().then(({ laterLeads: freshLaterLeads }) => {
          dispatchBatch(freshLaterLeads, 'GRUPO 2 (DISPARO DAS 16:00)');
        });
      } else {
        const remainingMinutes = (targetH * 60 + targetM) - (currentH * 60 + currentM);
        process.stdout.write(`\r⏳ [${formattedNow}] Aguardando 16:00... (Faltam ~${remainingMinutes} minutos)`);
        setTimeout(checkSchedule, 20000); // Checa a cada 20 segundos
      }
    }

    checkSchedule();
  } else {
    console.log(`
Uso do script:
  node scripts/disparo_reengajamento_04nov.cjs --now               # Executa agora para Grupo 1 e Grupo 3
  node scripts/disparo_reengajamento_04nov.cjs --schedule-16h      # Agenda Grupo 2 para as 16:00
  node scripts/disparo_reengajamento_04nov.cjs --dry-run --now     # Simula o envio de agora
`);
  }
}

main();
