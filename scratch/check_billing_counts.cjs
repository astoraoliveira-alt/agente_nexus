const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851'; // Edenred

async function checkCounts() {
    console.log(`📊 Querying database metrics for tenant ${tenantId}...`);

    // 1. Total messages in messages table for tenant
    const { count: totalMessages, error: msgError } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);
        
    // 2. Outbound messages in messages table for tenant
    const { count: outboundMessages, error: outMsgError } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('direction', 'outbound');

    // 3. Outbound queue total stats for tenant
    const { data: queueStats, error: qError } = await supabase
        .from('outbound_queue')
        .select('status')
        .eq('tenant_id', tenantId);

    // 4. Total in whatsapp_billing_windows for tenant
    const { count: billingWindows, error: winError } = await supabase
        .from('whatsapp_billing_windows')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

    // 5. Total in whatsapp_billing_windows for tenant last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: billingWindows30d, error: win30Error } = await supabase
        .from('whatsapp_billing_windows')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('window_started_at', thirtyDaysAgo);

    // 6. Distinct phone numbers in processed outbound_queue for tenant
    const { data: distinctOutboundLeads, error: distinctError } = await supabase
        .from('outbound_queue')
        .select('contact_phone')
        .eq('tenant_id', tenantId)
        .neq('status', 'pending');

    if (msgError || qError || winError || distinctError) {
        console.error('❌ Error querying:', { msgError, qError, winError, distinctError });
        return;
    }

    const queueCounts = queueStats.reduce((acc, curr) => {
        acc[curr.status] = (acc[curr.status] || 0) + 1;
        return acc;
    }, {});

    const sentQueueCount = queueStats.filter(q => q.status !== 'pending' && q.status !== 'failed').length;

    console.log('\n==================================================');
    console.log(`💬 Table [messages]:`);
    console.log(`   - Total messages: ${totalMessages}`);
    console.log(`   - Outbound messages: ${outboundMessages}`);
    console.log(`\n📬 Table [outbound_queue] Statuses:`);
    Object.entries(queueCounts).forEach(([status, count]) => {
        console.log(`   - ${status}: ${count}`);
    });
    console.log(`   - Total processed/sent (non-pending/non-failed): ${sentQueueCount}`);
    
    console.log(`\n💳 Table [whatsapp_billing_windows]:`);
    console.log(`   - Total windows: ${billingWindows}`);
    console.log(`   - Total windows last 30 days: ${billingWindows30d}`);
    
    const uniquePhones = new Set(distinctOutboundLeads.map(d => d.contact_phone));
    console.log(`\n📞 Unique contact phones in processed outbound_queue: ${uniquePhones.size}`);
    console.log('==================================================\n');
}

checkCounts();
