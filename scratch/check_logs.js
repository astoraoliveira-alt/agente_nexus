import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(url, key);

async function check() {
    const { data: logs } = await supabase
        .from('integration_logs')
        .select('*')
        .eq('phone_number', '5511993434870')
        .order('processed_at', { ascending: false })
        .limit(20);

    console.log(`Fetched ${logs?.length || 0} integration logs`);
    logs?.forEach(log => {
        console.log(`[${log.processed_at}] [${log.provider}] Status: ${log.status}`);
        const payloadStr = JSON.stringify(log.payload);
        if (payloadStr.includes('LEN*')) {
            console.log('-> PAYLOAD HAS LEN*');
        }
        if (payloadStr.includes('LENZ')) {
            console.log('-> PAYLOAD HAS LENZ');
        }
    });
}

check();
