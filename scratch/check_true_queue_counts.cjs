const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851'; // Edenred

async function checkTrueCounts() {
    console.log(`📊 Querying exact database counts for tenant ${tenantId}...`);

    const statuses = ['pending', 'sent', 'delivered', 'read', 'converted', 'not_delivered', 'failed', 'rejected'];
    const counts = {};

    for (const status of statuses) {
        const { count, error } = await supabase
            .from('outbound_queue')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('status', status);

        if (error) {
            console.error(`❌ Error querying status ${status}:`, error);
        } else {
            counts[status] = count || 0;
        }
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const totalProcessed = total - (counts['pending'] || 0) - (counts['failed'] || 0) - (counts['rejected'] || 0);

    console.log('\n==================================================');
    console.log(`📬 True [outbound_queue] Counts (with exact count):`);
    Object.entries(counts).forEach(([status, count]) => {
        console.log(`   - ${status}: ${count}`);
    });
    console.log(`   - Total leads in queue: ${total}`);
    console.log(`   - Total processed/sent (delivered, read, sent, converted, not_delivered): ${totalProcessed}`);
    console.log('==================================================\n');
}

checkTrueCounts();
