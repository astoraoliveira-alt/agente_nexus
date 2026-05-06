import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(url, serviceRole);

async function findPhone() {
    console.log("Searching for 5519988312485...");
    
    const { data: q1 } = await supabase.from('outbound_queue').select('campaign_id, contact_name, status').eq('contact_phone', '5519988312485');
    console.log("In outbound_queue:", q1);

    const { data: q2 } = await supabase.from('agent_leads').select('campaign_id, name').eq('whatsapp', '5519988312485');
    console.log("In agent_leads:", q2);
    
    const { data: q3 } = await supabase.from('messages').select('conversation_id').eq('remote_id', '5519988312485');
    console.log("In messages (remote_id):", q3);
}

findPhone();
