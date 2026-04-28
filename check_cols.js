
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function debug() {
  const { data: columns, error } = await supabase.rpc('get_table_columns', { table_name: 'integration_logs' });
  // If RPC doesn't exist, try direct query
  if (error) {
    console.log("Trying direct information_schema query...");
    const { data: cols, error: err2 } = await supabase.from('information_schema.columns')
        .select('column_name')
        .eq('table_name', 'integration_logs');
    console.log(cols || err2);
  } else {
    console.log(columns);
  }
}

debug();
