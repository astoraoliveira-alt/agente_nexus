import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(url, key);

async function check() {
    // Busca a conversa
    const { data: convs } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_identifier', '5511993434870');
        
    console.log("Conversas encontradas:", convs?.length);
    for (const conv of convs || []) {
        console.log(`Conversa ID: ${conv.id} | Status: ${conv.status} | Nome: ${conv.user_name}`);
        
        // Busca as mensagens da conversa
        const { data: msgs } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: true });
            
        console.log(`Mensagens (${msgs?.length || 0}):`);
        msgs?.forEach(m => {
            console.log(`[${m.created_at}] [${m.direction}/${m.sender_type}]: ${m.content}`);
        });
        console.log('----------------------------------------------------');
    }
}

check();
