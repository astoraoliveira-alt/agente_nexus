const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Error: Supabase credentials missing from environment.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkEverything() {
    console.log('--- 1. BUSCANDO TODAS AS CAMPANHAS ATIVAS OU CRIADAS RECENTEMENTE ---');
    const { data: campaigns, error: campErr } = await supabase
        .from('campaigns')
        .select('id, name, status, daily_limit, capping_config, start_date, end_date, start_time, end_time, reengagement_enabled, tenant_id, created_at')
        .order('created_at', { ascending: false });

    if (campErr) {
        console.error('Erro ao buscar campanhas:', campErr);
        return;
    }

    // Identificar a campanha de 4000 registros e as outras 2
    const targetIds = [
        '443d9d4b-ef21-4968-be11-3530dc01ef73',
        'b4f4f496-2e6f-4456-8c00-64a2b2c92ae4'
    ];

    for (const c of campaigns) {
        const { count: totalQueue } = await supabase
            .from('outbound_queue')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', c.id);

        if (targetIds.includes(c.id) || totalQueue >= 3500 || c.created_at.startsWith('2026-07-13')) {
            console.log(`\n==================================================`);
            console.log(`🏷️ Campanha: "${c.name}" (${c.id})`);
            console.log(`⚡ Status: ${c.status} | Criada em: ${c.created_at}`);
            console.log(`📊 Total no Outbound Queue: ${totalQueue}`);
            console.log(`⚙️ daily_limit: ${c.daily_limit} | capping_config:`, JSON.stringify(c.capping_config));
            console.log(`📅 start_date: ${c.start_date} | end_date: ${c.end_date} | start_time: ${c.start_time} | end_time: ${c.end_time}`);
            console.log(`🔄 reengagement_enabled: ${c.reengagement_enabled}`);

            // Checar envios hoje nesta campanha
            const todayStr = new Date().toISOString().split('T')[0]; // aproximado UTC/SP
            const { count: sentTodayCount } = await supabase
                .from('outbound_queue')
                .select('*', { count: 'exact', head: true })
                .eq('campaign_id', c.id)
                .in('status', ['sent', 'delivered', 'read']);

            console.log(`📈 Leads com status sent/delivered/read hoje/total na fila: ${sentTodayCount}`);

            // Testar RPC get_next_leads_secure diretamente
            const { data: rpcLeads, error: rpcErr } = await supabase
                .rpc('get_next_leads_secure', {
                    p_tenant_id: c.tenant_id,
                    p_campaign_id: c.id,
                    p_limit: 5
                });

            if (rpcErr) {
                console.error(`❌ Erro no RPC get_next_leads_secure:`, rpcErr.message);
            } else {
                console.log(`🎯 RPC get_next_leads_secure retornou ${rpcLeads ? rpcLeads.length : 0} leads para esta campanha.`);
                if (rpcLeads && rpcLeads.length > 0) {
                    console.log(`   Exemplo do primeiro lead retornado: ${rpcLeads[0].phone} (${rpcLeads[0].id})`);
                    // Devolver para pending (como o rpc marcou processing)
                    const rpcIds = rpcLeads.map(l => l.id);
                    await supabase.from('outbound_queue').update({ status: 'pending' }).in('id', rpcIds);
                }
            }
        }
    }
}

checkEverything();
