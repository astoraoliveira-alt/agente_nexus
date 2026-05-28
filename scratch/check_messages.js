import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(url, key);

async function check() {
    const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', 'c0fcd143-bf6b-4573-ad1a-ca575f0a20cb') // Let's search by phone instead or conversation_id if we know it.
        .order('created_at', { ascending: true });

    if (!messages || messages.length === 0) {
        // Let's search conversations to find the ID first.
        const { data: convs } = await supabase
            .from('conversations')
            .select('*')
            .eq('user_identifier', '5511993434870');
            
        console.log('Conversations:', convs);
        if (convs && convs.length > 0) {
            const { data: msgs } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', convs[0].id)
                .order('created_at', { ascending: true });
            
            console.log('--- MESSAGES ---');
            msgs?.forEach(m => {
                console.log(`[${m.sender_type}] [${m.created_at}]: ${m.content}`);
                if (m.metadata) console.log(`Metadata:`, JSON.stringify(m.metadata));
            });
        }
    } else {
        console.log('Messages directly from conv ID:', messages);
    }
}

check();
