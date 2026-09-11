import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
async function run() {
    const { data } = await supabase.rpc('exec_readonly_sql', { 
        q: "SELECT prosrc FROM pg_proc WHERE proname = 'handle_message_status_update'" 
    });
    console.log(data?.[0]?.prosrc);
}
run();
