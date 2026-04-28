
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://wyfmyipbvoggusclwdhj.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU');

async function inspectTriggers() {
  const { data, error } = await supabase.rpc('inspect_table_triggers', { p_table_name: 'messages' });
  
  if (error) {
    // If rpc doesn't exist, try direct query via SQL (if enabled for service_role)
    const { data: rawData, error: rawError } = await supabase.from('pg_trigger').select('*').limit(1);
    if (rawError) {
       console.log("Could not inspect triggers via RPC or direct query. I will try to list functions.");
    }
  }

  // Alternative: List all functions containing 'billing'
  const { data: funcs, error: funcError } = await supabase
    .from('pg_proc')
    .select('proname')
    .ilike('proname', '%billing%');
  
  console.log("Billing functions in DB:", funcs ? funcs.map(f => f.proname) : "None found");
}

inspectTriggers();
