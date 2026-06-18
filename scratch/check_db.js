import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data: leads, error } = await supabase.rpc('get_campaign_leads_enriched', {
    p_campaign_id: 'ebac8bae-0921-4ed2-beac-3621033520b6',
    p_tenant_id: '7d885834-3158-4cf1-8fcb-2b442b588975' // Wait, I need the tenant id. Let me get it from campaigns.
  });
  console.log('Error:', error);
  if (leads) {
    const statusCounts = {};
    for (const lead of leads) {
      statusCounts[lead.status] = (statusCounts[lead.status] || 0) + 1;
    }
    console.log('Leads status counts from DB:', statusCounts);
  }
}
async function getTenant() {
  const { data } = await supabase.from('campaigns').select('tenant_id').eq('id', 'ebac8bae-0921-4ed2-beac-3621033520b6').single();
  if (data) {
    const { data: leads, error } = await supabase.rpc('get_campaign_leads_enriched', {
      p_campaign_id: 'ebac8bae-0921-4ed2-beac-3621033520b6',
      p_tenant_id: data.tenant_id
    });
    if (leads) {
      const statusCounts = {};
      let isConv = 0, isResp = 0;
      for (const lead of leads) {
        statusCounts[lead.status] = (statusCounts[lead.status] || 0) + 1;
        if (lead.is_converted) isConv++;
        if (lead.response_detected) isResp++;
      }
      console.log('Leads status counts from DB:', statusCounts);
      console.log('Is converted total:', isConv);
      console.log('Response detected total:', isResp);
    }
  }
}
getTenant();
