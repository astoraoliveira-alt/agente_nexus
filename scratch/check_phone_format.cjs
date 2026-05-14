const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function check() {
  const { data: al, error: e1 } = await sb
    .from('agent_leads')
    .select('whatsapp, cta_link, campaign_id')
    .not('cta_link', 'is', null)
    .limit(3);
  console.log('agent_leads sample:', JSON.stringify(al, null, 2));
  if (e1) console.error('agent_leads error:', e1);

  const { data: oq, error: e2 } = await sb
    .from('outbound_queue')
    .select('contact_phone, campaign_id, status')
    .limit(5);
  console.log('outbound_queue sample:', JSON.stringify(oq, null, 2));
  if (e2) console.error('outbound_queue error:', e2);
}
check().catch(console.error);
