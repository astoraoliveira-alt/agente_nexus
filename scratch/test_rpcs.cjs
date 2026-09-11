const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', 'porteiro', '.env');
const envData = fs.readFileSync(envPath, 'utf8');
let url = '', key = '';
envData.split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k?.trim() === 'SUPABASE_URL') url = v.trim();
    if (k?.trim() === 'SUPABASE_SERVICE_ROLE_KEY') key = v.trim();
});

const supabase = createClient(url, key);

async function testRPCs() {
  const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851'; // Edenred Tenant ID
  console.log('Testing get_edenred_conversion_funnel...');
  const res1 = await supabase.rpc('get_edenred_conversion_funnel', { p_tenant_id: tenantId });
  console.log('get_edenred_conversion_funnel result:', res1.data || res1.error);

  console.log('Testing trigger_fiserv_handoff...');
  const res2 = await supabase.rpc('trigger_fiserv_handoff', {
    p_tenant_id: tenantId,
    p_conversation_id: '00000000-0000-0000-0000-000000000000',
    p_initial_message: 'Teste de handoff'
  });
  console.log('trigger_fiserv_handoff result:', res2.data || res2.error);
}

testRPCs();
