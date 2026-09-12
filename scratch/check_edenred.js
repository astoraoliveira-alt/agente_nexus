import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabaseAdmin = createClient(url, serviceKey);

async function checkCompanies() {
  const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

  // Test query with Edenred ID
  console.time('agent_leads_edenred');
  const { data: leads, error } = await supabaseAdmin
    .from('agent_leads')
    .select('*')
    .eq('tenant_id', tenantId)
    .or('status.eq.converted,status.eq.formalization_pending,status.eq.finalizacao_sucesso,metadata->>pipeline_stage.not.is.null,metadata->>loan_request_id.not.is.null,metadata->>fiserv_requested_at.not.is.null')
    .order('created_at', { ascending: false })
    .limit(100);
  console.timeEnd('agent_leads_edenred');
  console.log('Leads for Edenred count:', leads?.length, 'error:', error);
  leads?.forEach(l => {
    console.log(`Lead: ${l.name} (${l.whatsapp}) - status: ${l.status}`);
  });

  console.time('conversations_edenred');
  const { data: convs, error: convError } = await supabaseAdmin
    .from('conversations')
    .select('*, agents:agent_id(name, type)')
    .eq('tenant_id', tenantId)
    .or('metadata->>pipeline_stage.not.is.null,metadata->>loan_request_id.not.is.null,metadata->>finalizacao_sucesso.eq.true')
    .order('last_message_at', { ascending: false })
    .limit(50);
  console.timeEnd('conversations_edenred');
  console.log('Convs for Edenred count:', convs?.length, 'error:', convError);
  convs?.forEach(c => {
    console.log(`Conv: ${c.user_name} (${c.user_identifier})`);
  });
}

checkCompanies();
