
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://wyfmyipbvoggusclwdhj.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU');

async function listTriggers() {
  const sql = `
    SELECT 
        event_object_table as table_name, 
        trigger_name, 
        action_statement as definition
    FROM information_schema.triggers 
    WHERE trigger_schema = 'public'
    ORDER BY table_name, trigger_name;
  `;
  
  // Since I can't run raw SQL, I'll try to use a trick to find triggers calling the bad function.
  // I'll search for the function name in pg_proc if I can.
  
  console.log("Searching for any function or trigger referencing 'fn_apply_whatsapp_billing_window_logic'...");
  
  // Actually, I'll try to use the 'rpc' to get all function names again, but more broadly.
  const { data: funcs, error } = await supabase.from('pg_proc').select('proname').limit(1000);
  
  if (funcs) {
    const bad = funcs.filter(f => f.proname.includes('fn_apply_whatsapp_billing_window_logic'));
    console.log("Functions found:", bad.map(b => b.proname));
  } else {
    console.log("Could not list functions via PostgREST.");
  }
}

listTriggers();
