import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabaseAdmin = createClient(url, serviceKey);

async function testFast() {
  const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

  console.time('fast_query');
  const [leadsRes, convsRes] = await Promise.all([
    supabaseAdmin
      .from('agent_leads')
      .select('id, name, identifier, whatsapp, status, metadata, created_at, tenant_id')
      .eq('tenant_id', tenantId)
      .not('metadata->loan_request_id', 'is', null),
    supabaseAdmin
      .from('conversations')
      .select('id, user_identifier, user_name, metadata, status, last_message_at, created_at, agent_id, agents:agent_id(name, type)')
      .eq('tenant_id', tenantId)
      .not('metadata->loan_request_id', 'is', null)
  ]);
  console.timeEnd('fast_query');
  console.log('Leads:', leadsRes.data?.length, 'Convs:', convsRes.data?.length);
  console.log('Lead rows:', leadsRes.data);
}

testFast();
