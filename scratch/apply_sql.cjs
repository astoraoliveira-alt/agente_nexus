const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function applySql() {
  const sql = fs.readFileSync('database/rpc/get_next_leads_secure.sql', 'utf8');
  // Removing the comments and just using the create function
  const { data, error } = await supabase.rpc('execute_sql', { sql_query: sql });
  if (error) {
    console.log("Failed to execute via execute_sql", error);
  } else {
    console.log("SQL Applied successfully");
  }
}
applySql();
