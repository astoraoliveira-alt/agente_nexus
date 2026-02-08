import { supabase } from './src/lib/supabase';
async function test() {
  const { data, error } = await supabase
    .from('agent_audit_logs')
    .select('*, actor:users(full_name)')
    .limit(1);
  console.log('Error:', JSON.stringify(error, null, 2));
  console.log('Data:', JSON.stringify(data, null, 2));
}
test();
