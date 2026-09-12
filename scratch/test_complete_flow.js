import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(url, serviceKey);

async function testFastOr() {
  const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

  console.time('fast_or');
  const { data, error } = await supabase
    .from('agent_leads')
    .select('id, name, identifier, whatsapp, status, metadata, created_at, tenant_id')
    .eq('tenant_id', tenantId)
    .or('status.in.(converted,formalization_pending,finalizacao_sucesso),metadata->loan_request_id.not.is.null');
  console.timeEnd('fast_or');
  console.log('Results:', data?.length, 'error:', error);
}

testFastOr();
