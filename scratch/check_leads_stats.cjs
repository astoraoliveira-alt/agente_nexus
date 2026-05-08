const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkLeads() {
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, name')
    .ilike('name', '%4 contatos%')
    .single();

  if (!campaign) {
    console.log('Campaign not found');
    return;
  }

  console.log(`Checking leads for campaign: ${campaign.name} (${campaign.id})`);

  const { data: leads } = await supabase
    .from('outbound_queue')
    .select('id, contact_phone, status, response_detected, conversation_id')
    .eq('campaign_id', campaign.id);

  console.log('Leads in outbound_queue:');
  console.table(leads);

  for (const lead of leads) {
    if (lead.conversation_id) {
        const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', lead.conversation_id)
            .eq('sender_type', 'user');
        console.log(`Lead ${lead.contact_phone} has ${count} inbound messages.`);
    } else {
        console.log(`Lead ${lead.contact_phone} has no conversation_id.`);
    }
  }
}

checkLeads();
