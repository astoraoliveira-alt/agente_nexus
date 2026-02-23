require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('integration_logs')
    .select('payload, error_details, status')
    .eq('provider', 'vapi')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) console.error("Error fetching logs:", error);
  else {
    console.log("Last Vapi Log error details:", data[0]?.error_details);
    if(data[0]?.payload?.message?.costBreakdown === undefined) {
      console.log("costBreakdown is REALLY undefined in DB payload");
    }
  }
}
check();
