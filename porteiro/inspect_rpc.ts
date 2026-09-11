import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectRpc() {
    console.log('--- 🛡️ INSPECTING pg_indexes ---');
    const sql = `
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename IN ('messages', 'message_status_history', 'outbound_queue', 'conversations')
    `;

    const { data, error } = await supabase.rpc('exec_readonly_sql', { q: sql });

    if (error) {
        console.error('❌ Error executing SQL:', error);
    } else {
        console.log('Indexes:', JSON.stringify(data, null, 2));
    }
}
inspectRpc();
