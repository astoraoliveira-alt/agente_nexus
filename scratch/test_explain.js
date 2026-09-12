import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabaseAdmin = createClient(url, serviceKey);

async function checkExplain() {
  const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

  // Check what columns are indexed on agent_leads
  const { data: cols } = await supabaseAdmin.from('agent_leads').select('*').limit(1);
  console.log('Sample agent_lead keys:', Object.keys(cols[0] || {}));

  // Let's test a clean, indexed query on agent_leads
  console.time('optimized_agent_leads_1');
  const q1 = await supabaseAdmin
    .from('agent_leads')
    .select('id, name, identifier, whatsapp, phone, status, metadata, created_at, tenant_id')
    .eq('tenant_id', tenantId)
    .in('status', ['converted', 'formalization_pending', 'finalizacao_sucesso', 'pending'])
    .limit(100);
  console.timeEnd('optimized_agent_leads_1');
  console.log('q1 count:', q1.data?.length);

  // Let's test conversations query
  console.time('optimized_convs_1');
  const q2 = await supabaseAdmin
    .from('conversations')
    .select('id, user_identifier, user_name, metadata, status, last_message_at, created_at, agent_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'human_active')
    .limit(50);
  console.timeEnd('optimized_convs_1');
  console.log('q2 count:', q2.data?.length);
}

checkExplain();
