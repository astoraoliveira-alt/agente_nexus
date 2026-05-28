import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(url, key);

async function check() {
    const { data: leads, error } = await supabase
        .from('agent_leads')
        .select('id, name, whatsapp, cta_link')
        .like('cta_link', '%TEVOKi%');

    console.log('Error:', error);
    console.log(`Leads with TEVOKi (base64 for LEN*): ${leads?.length || 0}`);
    leads?.forEach(lead => {
        console.log(`ID: ${lead.id} | Name: ${lead.name} | Phone: ${lead.whatsapp}`);
        console.log(`Link: ${lead.cta_link}`);
    });
}

check();
