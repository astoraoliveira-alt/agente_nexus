/**
 * reset_campaign_engagement.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Recoloca leads de uma campanha como `pending` para um novo disparo.
 *
 * Uso:
 *   node scratch/reset_campaign_engagement.cjs
 *   node scratch/reset_campaign_engagement.cjs <campaign_id>
 *   node scratch/reset_campaign_engagement.cjs <campaign_id> --status=sent,delivered
 *   node scratch/reset_campaign_engagement.cjs <campaign_id> --dry-run
 *
 * Flags:
 *   --status=s1,s2  Filtra apenas leads com esses statuses (default: todos exceto 'converted')
 *   --dry-run       Apenas lista o que seria alterado, sem gravar
 *   --all           Inclui também leads 'converted' (usar com cautela)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const readline = require('readline');

// ─── Config ──────────────────────────────────────────────────────────────────
const envFile = fs.readFileSync('.env.local', 'utf8');
const supabaseUrl = (envFile.match(/VITE_SUPABASE_URL=(.+)/) || [])[1]?.trim();
const SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

if (!supabaseUrl) {
    console.error('❌  VITE_SUPABASE_URL não encontrado no .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, SERVICE_ROLE);

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argCampaignId = args.find(a => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const includeConverted = args.includes('--all');
const statusFlag = (args.find(a => a.startsWith('--status=')) || '').replace('--status=', '');
const filterStatuses = statusFlag ? statusFlag.split(',').map(s => s.trim()) : null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

function statusColor(s) {
    const map = { pending: '🟡', sent: '🟢', delivered: '🟢', failed: '🔴', deduplicated: '🟠', converted: '✅', rejected: '⛔' };
    return `${map[s] || '⚪'} ${s}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  🔄  Reset de Engajamento de Campanha');
    if (dryRun) console.log('  ⚠️   MODO DRY-RUN — nenhuma alteração será gravada');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 1. Listar campanhas
    const { data: campaigns, error: campErr } = await supabase
        .from('campaigns')
        .select('id, name, status, total_contacts, sent_count')
        .order('created_at', { ascending: false });

    if (campErr || !campaigns?.length) {
        console.error('❌  Erro ao buscar campanhas:', campErr?.message || 'sem dados');
        process.exit(1);
    }

    let campaignId = argCampaignId;

    if (!campaignId) {
        console.log('📋  Campanhas disponíveis:\n');
        campaigns.forEach((c, i) => {
            console.log(`  [${i + 1}] ${c.name}`);
            console.log(`       ID: ${c.id}`);
            console.log(`       Status: ${c.status} | Total: ${c.total_contacts ?? '?'} | Enviados: ${c.sent_count ?? '?'}\n`);
        });

        const choice = await ask('Digite o número ou o ID da campanha: ');
        const idx = parseInt(choice, 10);

        if (!isNaN(idx) && idx >= 1 && idx <= campaigns.length) {
            campaignId = campaigns[idx - 1].id;
        } else {
            campaignId = choice;
        }
    }

    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign) {
        console.error(`❌  Campanha com ID "${campaignId}" não encontrada.`);
        process.exit(1);
    }

    console.log(`\n✅  Campanha selecionada: ${campaign.name} (${campaign.id})\n`);

    // 2. Buscar leads da fila
    const { data: queue, error: qErr } = await supabase
        .from('outbound_queue')
        .select('id, contact_phone, status, reengagement_attempt_count, idempotency_key')
        .eq('campaign_id', campaignId);

    if (qErr) {
        console.error('❌  Erro ao buscar outbound_queue:', qErr.message);
        process.exit(1);
    }

    if (!queue?.length) {
        console.log('⚠️   Nenhum lead encontrado na fila para essa campanha.');
        process.exit(0);
    }

    // Contagem por status
    const byStatus = queue.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
    }, {});

    console.log('📊  Distribuição atual da fila:');
    Object.entries(byStatus).forEach(([s, n]) => console.log(`     ${statusColor(s)}: ${n}`));
    console.log();

    // 3. Filtrar quais resetar
    let targets = queue.filter(r => {
        if (r.status === 'converted' && !includeConverted) return false;
        if (r.status === 'pending') return false; // já está pronto
        if (filterStatuses) return filterStatuses.includes(r.status);
        return true; // todos exceto converted e pending (já tratados acima)
    });

    if (!targets.length) {
        console.log('✅  Nenhum lead elegível para reset (todos já estão pending ou converted).');
        process.exit(0);
    }

    console.log(`🎯  ${targets.length} lead(s) serão recolocados como pending.\n`);

    if (dryRun) {
        console.log('── DRY-RUN: leads que seriam resetados ──────────────────────────');
        targets.slice(0, 20).forEach(r =>
            console.log(`   ${r.contact_phone} | status: ${r.status} | attempt: ${r.reengagement_attempt_count ?? 0}`)
        );
        if (targets.length > 20) console.log(`   ... e mais ${targets.length - 20} leads.`);
        console.log('\n🏁  Dry-run concluído. Nenhum dado foi alterado.\n');
        process.exit(0);
    }

    // 4. Confirmação
    const confirm = await ask(`⚠️   Confirma o reset de ${targets.length} lead(s)? (s/N): `);
    if (!['s', 'S', 'sim', 'yes', 'y'].includes(confirm)) {
        console.log('\n🚫  Operação cancelada.\n');
        process.exit(0);
    }

    // 5. Atualizar em chunks
    const CHUNK = 100;
    let updated = 0;
    let failed = 0;

    console.log('\n⏳  Atualizando...\n');

    for (let i = 0; i < targets.length; i += CHUNK) {
        const chunk = targets.slice(i, i + CHUNK);
        const ids = chunk.map(r => r.id);

        // Monta updates individuais para incrementar a idempotency_key por lead
        const updates = chunk.map(r => {
            const currentAttempt = (r.reengagement_attempt_count ?? 0) + 1;
            return {
                id: r.id,
                status: 'pending',
                retry_count: 0,
                error_message: null,
                scheduled_at: new Date().toISOString(),
                sent_at: null,
                last_attempt_at: null,
                dedup_at: null,
                reengagement_attempt_count: currentAttempt,
                // Chave única para evitar bloqueio por idempotência
                idempotency_key: `${campaignId}:${r.contact_phone}:re_${currentAttempt}_${Date.now()}`
            };
        });

        for (const upd of updates) {
            const { error: upErr } = await supabase
                .from('outbound_queue')
                .update({
                    status: upd.status,
                    retry_count: upd.retry_count,
                    error_message: upd.error_message,
                    scheduled_at: upd.scheduled_at,
                    sent_at: upd.sent_at,
                    last_attempt_at: upd.last_attempt_at,
                    dedup_at: upd.dedup_at,
                    reengagement_attempt_count: upd.reengagement_attempt_count,
                    idempotency_key: upd.idempotency_key
                })
                .eq('id', upd.id);

            if (upErr) {
                console.error(`  ❌  Falha em ${upd.id}:`, upErr.message);
                failed++;
            } else {
                updated++;
            }
        }

        process.stdout.write(`\r  Progresso: ${Math.min(i + CHUNK, targets.length)}/${targets.length}`);
    }

    console.log(`\n\n✅  Concluído! ${updated} leads recolocados como pending.`);
    if (failed) console.log(`⚠️   ${failed} leads falharam — verifique os logs acima.`);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(err => {
    console.error('\n❌  Erro fatal:', err.message);
    process.exit(1);
});
