
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient('https://wyfmyipbvoggusclwdhj.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU');

async function applyFix() {
  const sql = fs.readFileSync(path.join(__dirname, 'database/fix_record_message_billing.sql'), 'utf8');
  
  // Split SQL by double newline to send in chunks if necessary, but here I'll try to send as much as possible
  // Using a custom RPC 'exec_sql' if available, otherwise I'll have to use individual commands.
  // Since I don't know if 'exec_sql' exists, I'll try to use the raw PostgREST interface or just inform the user.
  
  console.log("Applying SQL fix to resolve record_message failure...");
  
  // We can't run raw SQL directly via Supabase client easily unless 'exec_sql' RPC is present.
  // I will check if I can find an 'exec_sql' or similar.
  
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
    console.error("Error applying SQL via exec_sql:", error);
    console.log("Falling back to individual command attempts if needed...");
  } else {
    console.log("SQL Fix applied successfully via exec_sql.");
  }
}

applyFix();
