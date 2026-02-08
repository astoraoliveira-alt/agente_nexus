import { supabase } from './src/lib/supabase';
async function test() {
  const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'agents' });
  if (error) {
     // Fallback to a simple select if RPC doesn't exist
     const { data: cols, error: err2 } = await supabase.from('agents').select('*').limit(1);
     console.log('Columns:', cols ? Object.keys(cols[0]) : 'None');
  } else {
    console.log('Columns:', data);
  }
}
test();
