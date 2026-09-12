import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNzcwNDksImV4cCI6MjA4Njk1MzA0OX0.4-3d-b4-YvX6XoJm53d9e83g6Z02e48yBqH50U6tK0E'; // anon key
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabaseAdmin = createClient(url, serviceKey);

async function checkTenants() {
  const { data: tenants } = await supabaseAdmin.from('tenants').select('id, name');
  console.log('Tenants:', tenants);
  const edenred = tenants?.find(t => t.name.toLowerCase().includes('edenred'));
  const tenantId = edenred?.id;
  console.log('Edenred ID:', tenantId);

  // Check how many rows in agent_leads
  const { count: leadCount } = await supabaseAdmin.from('agent_leads').select('*', { count: 'exact', head: true });
  console.log('Total rows in agent_leads:', leadCount);

  // Check how many rows in conversations
  const { count: convCount } = await supabaseAdmin.from('conversations').select('*', { count: 'exact', head: true });
  console.log('Total rows in conversations:', convCount);

  // Check how many rows in messages
  const { count: msgCount } = await supabaseAdmin.from('messages').select('*', { count: 'exact', head: true });
  console.log('Total rows in messages:', msgCount);

  // Let's test the exact query with tenant_id
  console.time('agent_leads_with_tenant');
  const { data: leads } = await supabaseAdmin
    .from('agent_leads')
    .select('*')
    .eq('tenant_id', tenantId)
    .or('status.eq.converted,status.eq.formalization_pending,status.eq.finalizacao_sucesso,metadata->>pipeline_stage.not.is.null,metadata->>loan_request_id.not.is.null,metadata->>fiserv_requested_at.not.is.null')
    .order('created_at', { ascending: false })
    .limit(100);
  console.timeEnd('agent_leads_with_tenant');
  console.log('Leads found:', leads?.map(l => ({ name: l.name, status: l.status, meta: l.metadata })));
}

checkTenants();
