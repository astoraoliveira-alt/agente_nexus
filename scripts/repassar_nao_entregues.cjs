/**
 * REPASSE DE TEMPLATE INICIAL PARA LEADS NÃO ENTREGUES (408 LEADS)
 * Campanha 03/nov (Ticket Friday)
 * 
 * Filtro estrito:
 * - campaign_id = 'ec37a964-dc92-4ae2-8539-a6cde2deb2ff'
 * - status = 'not_delivered' (Delta de 408 leads)
 * 
 * Template:
 * - 7f109fd6-f6ad-4f4c-926b-2e8403f68647 (Oferta de Crédito - Benefício Black Friday)
 * - Imagem oficial + botão "Solicitar análise"
 * 
 * Uso:
 *   node scripts/repassar_nao_entregues.cjs --dry-run
 *   node scripts/repassar_nao_entregues.cjs
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CAMPAIGN_ID = 'ec37a964-dc92-4ae2-8539-a6cde2deb2ff';
const ZENVIA_TOKEN = 'mJZ-6UC5zhffeBjG69b3tM93gv47QbJOfvK0';
const ZENVIA_CHANNEL = '551151183815';

const TEMPLATE_ID = '7f109fd6-f6ad-4f4c-926b-2e8403f68647';
const IMAGE_URL = 'https://chat.zenvia.com/storage/folders/a1af1ec136a1e60cf8cb8fa102edd9d872805851206df67904e5ed0cf7043296/files/a2aeb397ae4dd04e213736a206c26b67385ab709ae421b01d0ab73d04cda1bc1.bin';

const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendZenviaTemplate(toPhone, maxRetries = 3) {
  if (IS_DRY_RUN) {
    return { ok: true, status: 200, data: { dry_run: true } };
  }

  const zenviaUrl = 'https://api.zenvia.com/v2/channels/whatsapp/messages';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(zenviaUrl, {
        method: 'POST',
        headers: {
          'X-API-TOKEN': ZENVIA_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: ZENVIA_CHANNEL,
          to: toPhone,
          contents: [
            {
              type: 'template',
              templateId: TEMPLATE_ID,
              fields: {
                imageUrl: IMAGE_URL
              }
            }
          ]
        }),
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
        console.log(`    ⚠️ Tentativa ${attempt} falhou para ${toPhone} (${err.message}). Retentando...`);
        await sleep(1500);
      } else {
        return { ok: false, status: 0, error: err.message };
      }
    }
  }
}

async function run() {
  console.log(`\n=============================================================`);
  console.log(`🚀 REPASSE DO TEMPLATE INICIAL PARA LEADS NÃO ENTREGUES`);
  console.log(`⏰ Horário: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  console.log(`🛠️ Modo: ${IS_DRY_RUN ? 'SIMULAÇÃO (DRY RUN)' : 'PRODUÇÃO (ENVIOS REAIS)'}`);
  console.log(`📋 Template: Ticket Friday Completo (${TEMPLATE_ID})`);
  console.log(`=============================================================\n`);

  // Buscar estritamente os não entregues da campanha de hoje
  const { data: targets, error } = await supabase
    .from('outbound_queue')
    .select('id, contact_name, contact_phone, status, retry_count')
    .eq('campaign_id', CAMPAIGN_ID)
    .eq('status', 'not_delivered');

  if (error) {
    console.error('❌ Erro ao buscar leads não entregues:', error);
    return;
  }

  console.log(`🎯 Total de leads 'not_delivered' encontrados: ${targets.length}\n`);

  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    const res = await sendZenviaTemplate(item.contact_phone);

    if (res.ok) {
      successCount++;
      if (!IS_DRY_RUN) {
        const nowIso = new Date().toISOString();
        await supabase.from('outbound_queue').update({
          status: 'sent', // Volta para sent aguardando confirmação de entrega da Zenvia
          last_attempt_at: nowIso,
          sent_at: nowIso,
          retry_count: (item.retry_count || 0) + 1,
          error_message: null
        }).eq('id', item.id);
      }
    } else {
      failedCount++;
      console.log(`  ❌ Falha [${i + 1}/${targets.length}] ${item.contact_phone}: HTTP ${res.status}`);
    }

    if ((i + 1) % 25 === 0 || i === targets.length - 1) {
      console.log(`  Progresso [${i + 1}/${targets.length}] Aceitos pela API: ${successCount} | Erros: ${failedCount}`);
    }

    await sleep(IS_DRY_RUN ? 0 : 300); // cadência segura ~3.3 msgs/s
  }

  console.log(`\n=============================================================`);
  console.log(`🎉 REPASSE CONCLUÍDO!`);
  console.log(`   - Total Processado: ${targets.length}`);
  console.log(`   - Aceitos pela Zenvia: ${successCount}`);
  console.log(`   - Falhas: ${failedCount}`);
  console.log(`=============================================================\n`);
}

run();
