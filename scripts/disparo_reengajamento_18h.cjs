/**
 * DISPARO DE REENGAJAMENTO - CAMPANHA 03/NOV (18:00)
 * 
 * Público-alvo:
 * - Leads da campanha 03/nov que receberam a mensagem hoje (status: delivered, read, sent - total 670).
 * - Exclui estritamente quem já interagiu (respondeu no chat, clicou em botão, preencheu formulário).
 * - Total de leads selecionados: ~632 leads sem nenhuma interação ao longo do dia.
 * 
 * Template:
 * - Padrão: Template com botão único de simulação ("Oferta de Crédito v.2", ID: 72f33173-79cc-47cc-8a7c-eba3e20df9d3)
 *   com o botão de ação rápida [ Quero simular! ].
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

// Templates Disponíveis
const TEMPLATES = {
  v2: {
    id: '72f33173-79cc-47cc-8a7c-eba3e20df9d3',
    name: 'Oferta de Crédito v.2 (Botão Único: Quero simular!)',
    imageUrl: 'https://chat.zenvia.com/storage/folders/a1af1ec136a1e60cf8cb8fa102edd9d872805851206df67904e5ed0cf7043296/files/63656eb2ca6d6daf9ec20aca6bb4ddda82c7e86bd24cdf6349d7f0bced2c9bce.bin',
    buttonText: 'Quero simular!',
    logText: 'Oferta de Crédito v.2 - [Quero simular!]'
  },
  blackfriday: {
    id: '7f109fd6-f6ad-4f4c-926b-2e8403f68647',
    name: 'Oferta de Crédito - Benefício Black Friday (Botão: Solicitar análise)',
    imageUrl: 'https://chat.zenvia.com/storage/folders/a1af1ec136a1e60cf8cb8fa102edd9d872805851206df67904e5ed0cf7043296/files/a2aeb397ae4dd04e213736a206c26b67385ab709ae421b01d0ab73d04cda1bc1.bin',
    buttonText: 'Solicitar análise',
    logText: 'Oferta Ticket Friday - [Solicitar análise]'
  },
  v3: {
    id: '7376be0b-88e1-482b-b017-234aa8992d03',
    name: 'IA de Crédito - mensagem inicial v3 (Texto Curto)',
    imageUrl: 'https://chat.zenvia.com/storage/folders/a1af1ec136a1e60cf8cb8fa102edd9d872805851206df67904e5ed0cf7043296/files/04b3805c51f77828be61615dd135678a9522d17b7614956ffa2e7cdbd8d67228.bin',
    buttonText: 'Quero simular! | Falar com um agente!',
    logText: 'IA de Crédito v3 - [Quero simular!]'
  }
};

// Argumentos CLI
const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');
const TEMPLATE_KEY = (args.find(a => a.startsWith('--template=')) || '--template=v2').split('=')[1].toLowerCase();
const SCHEDULE_ARG = args.find(a => a.startsWith('--schedule-at='));

const activeTemplate = TEMPLATES[TEMPLATE_KEY] || TEMPLATES.v2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendZenviaTemplate(toPhone, templateConfig, maxRetries = 3) {
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
        templateId: templateConfig.id,
        fields: {
          imageUrl: templateConfig.imageUrl
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
  console.log(`📋 Template Selecionado: ${activeTemplate.name} [ID: ${activeTemplate.id}]`);
  console.log(`🔘 Botão do Template: [ ${activeTemplate.buttonText} ]`);
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

  // 2. Mapear quem teve qualquer interação ou concluiu formulário ao longo do dia
  const interactedPhones = new Set();
  leads.forEach(l => {
    const meta = l.metadata || {};
    if (meta.requested_amount || meta.revenue || meta.opt_in || meta.fiserv_status || meta.button_clicked || meta.identity_confirmed) {
      interactedPhones.add(l.whatsapp);
    }
  });

  queueItems.forEach(q => {
    if (q.response_detected || ['respondida', 'interagiu'].includes(q.status)) {
      interactedPhones.add(q.contact_phone);
    }
  });

  console.log(`📊 AUDITORIA DA BASE:`);
  console.log(`   - Total de registros na campanha: ${queueItems.length}`);
  console.log(`   - Leads não entregues (ignorados): ${queueItems.filter(q => q.status === 'not_delivered').length}`);
  console.log(`   - Leads que interagiram/responderam/preencheram hoje (excluídos): ${interactedPhones.size}`);

  // 3. Filtrar os leads entregues sem nenhuma interação
  const targetLeads = queueItems.filter(q => {
    // Apenas quem recebeu (delivered, read, sent)
    if (['not_delivered', 'failed'].includes(q.status)) return false;
    // Não pode ter interagido
    if (interactedPhones.has(q.contact_phone)) return false;
    return true;
  });

  const breakdown = { read: 0, delivered: 0, sent: 0 };
  targetLeads.forEach(t => {
    breakdown[t.status] = (breakdown[t.status] || 0) + 1;
  });

  console.log(`\n🎯 PÚBLICO-ALVO PARA O DISPARO DAS 18:00:`);
  console.log(`   - Total de leads aptos: ${targetLeads.length}`);
  console.log(`   - Lidos sem resposta (read): ${breakdown.read}`);
  console.log(`   - Entregues não lidos (delivered): ${breakdown.delivered}`);
  console.log(`   - Enviados aguardando confirmação (sent): ${breakdown.sent}`);
  console.log(`-------------------------------------------------------------\n`);

  if (targetLeads.length === 0) {
    console.log('✅ Nenhum lead pendente de reengajamento no momento.');
    return;
  }

  let successCount = 0;
  let failCount = 0;
  let skippedRecent = 0;

  for (let i = 0; i < targetLeads.length; i++) {
    const item = targetLeads[i];

    // Checagem de segurança: não enviar se recebeu mensagem nos últimos 45 minutos
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

    const res = await sendZenviaTemplate(item.contact_phone, activeTemplate);
    const nowIso = new Date().toISOString();

    if (res.ok) {
      successCount++;
      if (!IS_DRY_RUN) {
        // Atualiza contadores de reengajamento SEM alterar status para 'sent' (preserva m_entregues no dashboard)
        await supabase.from('outbound_queue').update({
          reengagement_attempt_count: (item.reengagement_attempt_count || 0) + 1,
          reengagement_last_sent_at: nowIso,
          last_attempt_at: nowIso
        }).eq('id', item.id);

        if (item.conversation_id) {
          await supabase.from('messages').insert({
            conversation_id: item.conversation_id,
            tenant_id: TENANT_ID,
            content: activeTemplate.logText,
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
      console.log(`  ❌ Falha [${i + 1}/${targetLeads.length}] ${item.contact_phone}: HTTP ${res.status}`);
    }

    if ((i + 1) % 50 === 0 || i === targetLeads.length - 1) {
      console.log(`  Progresso [${i + 1}/${targetLeads.length}] Sucessos: ${successCount} | Falhas: ${failCount} | Pulados recentes: ${skippedRecent}`);
    }

    await sleep(IS_DRY_RUN ? 0 : 350); // ~2.8 msgs/segundo
  }

  console.log(`\n=============================================================`);
  console.log(`🎉 DISPARO DAS 18:00 CONCLUÍDO COM SUCESSO!`);
  console.log(`   - Enviados com sucesso: ${successCount}/${targetLeads.length}`);
  console.log(`   - Falhas: ${failCount}`);
  console.log(`   - Pulados por envio recente: ${skippedRecent}`);
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
      process.stdout.write(`\r⏳ [${formattedNow}] Aguardando ${targetTimeStr}... (Faltam ~${(targetH * 60 + targetM) - (currentH * 60 + currentM)} minutos)`);
      setTimeout(checkSchedule, 15000); // Checa a cada 15 segundos
    }
  }

  checkSchedule();
} else {
  executeDispatch18h();
}
