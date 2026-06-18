import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: campaign } = await supabase.from('campaigns').select('id, tenant_id').limit(1).single();
  
  if (!campaign) {
    console.log("No campaigns found");
    return;
  }
  
  console.log("Testing with campaign:", campaign.id, "tenant:", campaign.tenant_id);

  const { data, error } = await supabase.rpc('execute_manual_reengagement_v2', {
    p_campaign_id: campaign.id,
    p_tenant_id: campaign.tenant_id,
    p_targets: ['not_delivered', 'no_response']
  });
  console.log("Error:", error);
  console.log("Data:", data);
}
test();
