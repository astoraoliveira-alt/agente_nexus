import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNzcwNDksImV4cCI6MjA4Njk1MzA0OX0.ALSvuPPm7QZd7rlmOMRkmBlzGE9-yjCgureTqDc2Yns';
const supabase = createClient(url, anonKey);

async function testConversations500() {
  const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

  // 1. Reproduce 500 error:
  const r1 = await supabase
    .from('conversations')
    .select('id, user_identifier, user_name, metadata, status, last_message_at, created_at, agent_id, agents:agent_id(name, type)')
    .eq('tenant_id', tenantId)
    .or('metadata->pipeline_stage.not.is.null,metadata->loan_request_id.not.is.null')
    .limit(50);
  console.log('r1 (500 error reproduced?):', r1.error);

  // 2. Fixed query using ->> text extractor:
  const r2 = await supabase
    .from('conversations')
    .select('id, user_identifier, user_name, metadata, status, last_message_at, created_at, agent_id, agents:agent_id(name, type)')
    .eq('tenant_id', tenantId)
    .or('metadata->>pipeline_stage.not.is.null,metadata->>loan_request_id.not.is.null')
    .limit(50);
  console.log('r2 (fixed):', r2.error, 'data count:', r2.data?.length);

  // 3. Agent leads query:
  const r3 = await supabase
    .from('agent_leads')
    .select('id, name, identifier, whatsapp, status, metadata, created_at, tenant_id')
    .eq('tenant_id', tenantId)
    .or('status.eq.converted,status.eq.formalization_pending,status.eq.finalizacao_sucesso,metadata->>loan_request_id.not.is.null,metadata->>fiserv_requested_at.not.is.null')
    .limit(100);
  console.log('r3 (agent_leads):', r3.error, 'data count:', r3.data?.length);
}

testConversations500();
