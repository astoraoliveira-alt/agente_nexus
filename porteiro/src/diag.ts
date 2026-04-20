import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMessages() {
    console.log('--- ÚLTIMAS 10 MENSAGENS ---');
    const { data, error } = await supabase
        .from('messages')
        .select('id, remote_id, content, created_at, sender_type')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Erro:', error.message);
        return;
    }

    console.log(JSON.stringify(data, null, 2));
}

checkMessages();
