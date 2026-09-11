import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
async function test() {
    const { data } = await supabase.rpc('exec_readonly_sql', { 
        q: `
        SELECT count(*) as total, count(conversation_id) as with_conv
        FROM public.outbound_queue
        WHERE campaign_id = '7b2f1109-9ad1-4760-8413-fb3d6420ff3e'
        ` 
    });
    console.log("OQ Counts:", data);
}
test();
