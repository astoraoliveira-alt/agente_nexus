import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNzcwNDksImV4cCI6MjA4Njk1MzA0OX0.ALSvuPPm7QZd7rlmOMRkmBlzGE9-yjCgureTqDc2Yns';
const supabase = createClient(url, anonKey);

async function testAgentLeadsPerf() {
  const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

  // Test 1: Query by tenant_id on agent_leads
  console.time('agent_leads_simple');
  const r1 = await supabase
    .from('agent_leads')
    .select('id, name, identifier, whatsapp, status, metadata, created_at, tenant_id')
    .eq('tenant_id', tenantId);
  console.timeEnd('agent_leads_simple');
  console.log('r1 count:', r1.data?.length, 'error:', r1.error);

  if (r1.data) {
    console.log('Sample leads for Edenred:');
    r1.data.forEach(l => {
      console.log(`- ${l.name} (${l.whatsapp}) - status: ${l.status}, has loan_request_id: ${!!l.metadata?.loan_request_id}`);
    });
  }
}

testAgentLeadsPerf();
