const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.rpc('get_campaign_metrics_v2', {
    p_campaign_id: 'ebac8bae-0921-4ed2-beac-3621033520b6', // From the dashboard URL or similar. Let's get tenant id first.
  });
  console.log('Error:', error);
  console.log('Metrics:', data);
  
  const { data: leads, error: e2 } = await supabase.rpc('get_campaign_leads_enriched', {
    p_campaign_id: 'ebac8bae-0921-4ed2-beac-3621033520b6',
  });
  console.log('Leads count:', leads ? leads.length : 0);
  
  if (leads) {
    const statusCounts = {};
    for (const lead of leads) {
      statusCounts[lead.status] = (statusCounts[lead.status] || 0) + 1;
    }
    console.log('Leads status counts:', statusCounts);
  }
}
check();
