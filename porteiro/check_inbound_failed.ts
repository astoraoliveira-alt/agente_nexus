import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkFailedInbound() {
    console.log('--- 🔍 INSPECTING FAILED/PROCESSING INBOUND QUEUE ---');
    const { data: processingItems, error: errProc } = await supabase
        .from('inbound_queue')
        .select('id, status, error_message, created_at, payload')
        .eq('status', 'processing')
        .limit(2);

    const { data: failedItems, error: errFail } = await supabase
        .from('inbound_queue')
        .select('id, status, error_message, created_at, payload')
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(3);

    if (errProc || errFail) {
        console.error('❌ Error fetching from inbound_queue:', errProc || errFail);
        return;
    }

    console.log('\n--- ⏳ PROCESSING ITEMS ---');
    processingItems?.forEach((item: any) => {
        console.log({
            id: item.id,
            status: item.status,
            error_message: item.error_message,
            created_at: item.created_at,
            content: item.payload?.content || item.payload?.message?.conversation || '[No text content]'
        });
    });

    console.log('\n--- ❌ FAILED ITEMS ---');
    failedItems?.forEach((item: any) => {
        console.log({
            id: item.id,
            status: item.status,
            error_message: item.error_message,
            created_at: item.created_at,
            content: item.payload?.content || item.payload?.message?.conversation || '[No text content]'
        });
    });
}

checkFailedInbound();
