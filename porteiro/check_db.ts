import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkQueueDetailed() {
    console.log('--- 🛡️ DETAILED DIAGNOSTIC: Outbound Queue ---');
    const { data, error } = await supabase
        .from('outbound_queue')
        .select(`
            id, 
            status, 
            scheduled_at, 
            agent_id,
            agents (id, evolution_instance)
        `)
        .eq('status', 'pending');

    if (error) {
        console.error('❌ Error:', error);
        return;
    }

    if (!data || data.length === 0) {
        console.log('📭 No pending items found by the query logic.');
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}

checkQueueDetailed();
