const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data: agent, error } = await supabase.from('agents').select('*').eq('id', '0e5a2927-1617-48a7-9e54-0834ddbbc924').single();
  console.log('Agent:', agent ? Object.keys(agent) : error);
  
  const { data: kbs, error: kbe } = await supabase.from('knowledge').select('*').eq('agent_id', '0e5a2927-1617-48a7-9e54-0834ddbbc924');
  console.log('Knowledge with agent_id:', kbs ? kbs.length : kbe);

  const { data: tools, error: te } = await supabase.from('agent_tools').select('*').eq('agent_id', '0e5a2927-1617-48a7-9e54-0834ddbbc924');
  console.log('Tools:', tools ? tools.length : te);

  const { data: flows, error: fe } = await supabase.from('conversational_flows').select('*').contains('linked_agents', ['0e5a2927-1617-48a7-9e54-0834ddbbc924']);
  console.log('Flows (array linked_agents):', flows ? flows.length : fe);

  const { data: flows2, error: fe2 } = await supabase.from('conversational_flows').select('*').eq('tenant_id', 'd290f1ee-6c54-4b01-90e6-d701748f0851');
  console.log('Flows (by tenant):', flows2 ? flows2.map(f => f.linked_agents) : fe2);
}
check();
