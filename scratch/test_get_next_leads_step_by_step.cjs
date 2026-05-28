const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);
const campaignId = 'fb8348df-5c26-42bb-a3a0-592cef3361b7'; // Carga teste 27/mai
const tenantId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

async function run() {
  console.log('Stepping through get_next_leads_secure logic in Javascript...');

  // Get campaign details
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (!campaign) {
    console.error('Campaign not found!');
    return;
  }

  // Get all leads for the campaign
  const { data: leads } = await supabase
    .from('outbound_queue')
    .select('*')
    .eq('campaign_id', campaignId);

  console.log(`Initial count in outbound_queue: ${leads.length}`);

  // Filter 1: status is pending or reengagement is active
  const f1 = leads.filter(oq => {
    return oq.status === 'pending'; // since none are sent/read/delivered
  });
  console.log(`Filter 1 (status is pending): ${f1.length}`);

  // Filter 2: capping check
  // (v_capping->>'override_for_incidents')::boolean = true OR NOT EXISTS contact_pressure_logs
  const capping = campaign.capping_config || {};
  const override = capping.override_for_incidents === true;
  console.log('capping_config:', capping);
  console.log('override_for_incidents is:', override);

  let f2 = f1;
  if (!override) {
    const cooldownHours = parseInt(capping.cooldown_hours || '24');
    // Fetch all pressure logs for these phones
    const phones = f1.map(oq => oq.contact_phone);
    const { data: pressureLogs } = await supabase
      .from('contact_pressure_logs')
      .select('contact_phone, sent_at')
      .in('contact_phone', phones);

    const blockedPhones = new Set();
    const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
    pressureLogs?.forEach(log => {
      if (new Date(log.sent_at) > cutoff) {
        blockedPhones.add(log.contact_phone);
      }
    });

    f2 = f1.filter(oq => !blockedPhones.has(oq.contact_phone));
    console.log(`Filter 2 (after contact pressure capping check): ${f2.length} (blocked ${blockedPhones.size})`);
  } else {
    console.log('Filter 2 (capping check bypassed): same as F1');
  }

  // Filter 3: Exclusão de convertidos
  // We need to check if there are conversions or messages
  // Since conversation_id is null for all pending leads, this is trivially true (none are converted)
  const f3 = f2.filter(oq => {
    const isConvertedStatus = oq.status?.toLowerCase() === 'converted';
    const isConvertedMeta = oq.metadata?.converted === 'true' || oq.metadata?.converted === true;
    return !isConvertedStatus && !isConvertedMeta;
  });
  console.log(`Filter 3 (excluding converted leads): ${f3.length}`);

  // Filter 4: Anti-colisão check
  // AND NOT EXISTS oq_check where status = 'processing' and contact_phone = oq.contact_phone in last 5 mins
  // Let's query if there are any 'processing' rows in the entire outbound_queue
  const { data: processingRows } = await supabase
    .from('outbound_queue')
    .select('contact_phone, created_at')
    .eq('status', 'processing');

  console.log(`Total processing rows in DB: ${processingRows?.length || 0}`);
  
  const blockedByProcessing = new Set();
  const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
  processingRows?.forEach(row => {
    // If created_at is in last 5 mins
    if (new Date(row.created_at) > fiveMinsAgo) {
      blockedByProcessing.add(row.contact_phone);
    }
  });

  const f4 = f3.filter(oq => !blockedByProcessing.has(oq.contact_phone));
  console.log(`Filter 4 (after anti-colisao): ${f4.length}`);

  // Filter 5: Final select join on campaigns and agents
  // Let's verify if the agent exists
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('id', campaign.agent_id)
    .single();

  console.log('Agent exists:', !!agent);
}

run();
