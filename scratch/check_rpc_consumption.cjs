const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851'; // Edenred

async function checkRpc() {
    const { data, error } = await supabase.rpc('get_detailed_consumption', {
        p_tenant_id: tenantId,
        p_days: 60
    });

    if (error) {
        console.error('❌ Error calling RPC:', error);
        return;
    }

    const dates = data.map(row => new Date(row.recorded_at).getTime()).filter(Boolean);
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    console.log('\n==================================================');
    console.log(`📅 Date Range in returned 1000 records:`);
    console.log(`   - Earliest: ${minDate.toISOString()}`);
    console.log(`   - Latest: ${maxDate.toISOString()}`);
    console.log('==================================================\n');
}

checkRpc();
