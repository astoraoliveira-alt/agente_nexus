import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(url, key);

async function check() {
    const { data: queueItems } = await supabase
        .from('outbound_queue')
        .select('*')
        .or('contact_phone.eq.5511993434870,contact_phone.eq.11993434870');

    console.log('--- OUTBOUND QUEUE ---');
    queueItems?.forEach(item => {
        console.log(`ID: ${item.id} | Phone: ${item.contact_phone} | Name: ${item.contact_name} | Status: ${item.status}`);
        console.log(`Metadata:`, JSON.stringify(item.metadata, null, 2));
    });
}

check();
