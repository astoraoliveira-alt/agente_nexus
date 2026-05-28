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

async function search() {
    const { data: leads } = await supabase
        .from('agent_leads')
        .select('*');

    console.log(`Checking ${leads?.length || 0} leads for ATLITUVA or FWEN or GMAR or LEO...`);
    
    leads?.forEach(lead => {
        const urlObj = new URL(lead.cta_link);
        const t = urlObj.searchParams.get('t');
        if (t) {
            const payload = decodeJWT(t);
            if (payload) {
                const payloadStr = JSON.stringify(payload);
                if (payloadStr.includes('FWEN') || payloadStr.includes('ATLITUVA') || payloadStr.includes('GMAR') || payloadStr.includes('LEO') || payloadStr.includes('CRIIGITIC')) {
                    console.log(`MATCH found in lead ID: ${lead.id} | Name: ${lead.name}`);
                    console.log(`Payload:`, payloadStr);
                    console.log(`Link: ${lead.cta_link}`);
                    console.log('----------------------------');
                }
            }
        }
    });
}

search();
