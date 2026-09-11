import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
async function test() {
    const { data } = await supabase.from('outbound_queue').select('conversation_id').not('conversation_id', 'is', null).limit(5);
    console.log(data);
}
test();
