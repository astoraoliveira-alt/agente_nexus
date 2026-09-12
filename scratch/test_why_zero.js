import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
const supabase = createClient(url, serviceKey);

async function testWhyZero() {
  const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

  // Test exact query in salesCockpit.service.ts
  const q1 = await supabase
    .from('agent_leads')
    .select('id, name, identifier, whatsapp, status, metadata, created_at, tenant_id')
    .eq('tenant_id', tenantId)
    .or('status.in.(converted,formalization_pending,finalizacao_sucesso),metadata->loan_request_id.not.is.null,metadata->fiserv_requested_at.not.is.null');

  console.log('q1 error:', q1.error);
  console.log('q1 count:', q1.data?.length);

  // Test without .or:
  const q2 = await supabase
    .from('agent_leads')
    .select('id, name, identifier, whatsapp, status, metadata, created_at, tenant_id')
    .eq('tenant_id', tenantId)
    .not('metadata->loan_request_id', 'is', null);

  console.log('q2 count:', q2.data?.length);

  // Test with .not.is.null on JSONB arrow
  const q3 = await supabase
    .from('agent_leads')
    .select('id, name, identifier, whatsapp, status, metadata, created_at, tenant_id')
    .eq('tenant_id', tenantId)
    .or('status.eq.converted,metadata->>loan_request_id.not.is.null,metadata->>fiserv_requested_at.not.is.null');

  console.log('q3 error:', q3.error);
  console.log('q3 count:', q3.data?.length);
}

testWhyZero();
