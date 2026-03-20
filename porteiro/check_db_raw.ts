import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkQueueRaw() {
    console.log('--- 🛡️ RAW TABLE CHECK: Outbound Queue ---');
    const { data, error } = await supabase
        .from('outbound_queue')
        .select('id, status, error_message, sent_at')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('❌ Error fetching queue:', error);
        return;
    }

    console.table(data);
}

checkQueueRaw();
