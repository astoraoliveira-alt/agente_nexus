import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(url, key);

function decodeJWT(token) {
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const payload = parts[1];
        const decoded = Buffer.from(payload, 'base64').toString('utf8');
        return JSON.parse(decoded);
    } catch (e) {
        return null;
    }
}

async function check() {
    const { data: leads } = await supabase
        .from('agent_leads')
        .select('*');

    console.log(`Total leads fetched: ${leads?.length || 0}`);
    
    leads?.forEach(lead => {
        const urlObj = new URL(lead.cta_link);
        const t = urlObj.searchParams.get('t');
        if (t) {
            const payload = decodeJWT(t);
            if (payload && (JSON.stringify(payload).includes('LENZ') || JSON.stringify(payload).includes('LEN*'))) {
                console.log(`ID: ${lead.id} | Name: ${lead.name} | Phone: ${lead.whatsapp}`);
                console.log(`Payload:`, JSON.stringify(payload));
                console.log(`Link: ${lead.cta_link}`);
                console.log('---------------------');
            }
        }
    });
}

check();
