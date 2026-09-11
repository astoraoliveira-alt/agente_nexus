const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.VITE_SUPABASE_ANON_KEY || ''
);

async function check() {
  const { data, error } = await supabase
    .from('active_campaign_leads')
    .select('cnpj, name, fiserv_status, loan_request_id, fiserv_external_status, metadata')
    .eq('loan_request_id', 6845);
  
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}

check();
