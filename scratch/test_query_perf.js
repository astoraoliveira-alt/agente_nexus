import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(url, key);

async function run() {
  console.log('Testing queries...');

  // 1. Current agent_leads query
  console.time('current_agent_leads');
  const r1 = await supabase
    .from('agent_leads')
    .select('*')
    .or('status.eq.converted,status.eq.formalization_pending,status.eq.finalizacao_sucesso,metadata->>pipeline_stage.not.is.null,metadata->>loan_request_id.not.is.null,metadata->>fiserv_requested_at.not.is.null')
    .order('created_at', { ascending: false })
    .limit(100);
  console.timeEnd('current_agent_leads');
  console.log('r1 count:', r1.data?.length, 'error:', r1.error);

  // 2. Simple status query on agent_leads
  console.time('status_in_agent_leads');
  const r2 = await supabase
    .from('agent_leads')
    .select('*')
    .in('status', ['converted', 'formalization_pending', 'finalizacao_sucesso'])
    .order('created_at', { ascending: false })
    .limit(100);
  console.timeEnd('status_in_agent_leads');
  console.log('r2 count:', r2.data?.length, 'error:', r2.error);

  // 3. Current conversations query
  console.time('current_conversations');
  const r3 = await supabase
    .from('conversations')
    .select('*, agents:agent_id(name, type)')
    .or('metadata->>pipeline_stage.not.is.null,metadata->>loan_request_id.not.is.null,metadata->>finalizacao_sucesso.eq.true')
    .order('last_message_at', { ascending: false })
    .limit(50);
  console.timeEnd('current_conversations');
  console.log('r3 count:', r3.data?.length, 'error:', r3.error);

  // 4. Simple conversations query
  console.time('simple_conversations');
  const r4 = await supabase
    .from('conversations')
    .select('id, user_identifier, user_name, metadata, status, last_message_at, created_at, agent_id')
    .eq('status', 'human_active')
    .limit(50);
  console.timeEnd('simple_conversations');
  console.log('r4 count:', r4.data?.length, 'error:', r4.error);
}

run();
