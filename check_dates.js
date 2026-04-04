import { createClient } from '@supabase/supabase-js';

async function checkDates() {
    const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
    const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
    const supabase = createClient(url, key);
    
    const { data: q } = await supabase
        .from('outbound_queue')
        .select('*')
        .in('status', ['sent', 'failed'])
        .order('id', { ascending: false })
        .limit(10);
        
    q?.forEach(item => {
        console.log(`[${item.status}] ${item.contact_name} sent at: ${item.sent_at || 'n/a'}, Error: ${item.error_message}`);
    });
}

checkDates();
