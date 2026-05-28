const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  console.log('Testing optimized SQL query logic using chunked batched queries...');
  
  const { data: convs } = await supabase.from('conversations').select('id, user_identifier, tenant_id');
  const { data: leads } = await supabase.from('agent_leads').select('campaign_id, whatsapp, tenant_id');
  const { data: campaigns } = await supabase.from('campaigns').select('id, name, success_criteria, success_link_filter');
  
  const leadMap = new Map();
  for (const lead of leads || []) {
    leadMap.set(`${lead.tenant_id}:${lead.whatsapp}`, lead);
  }
  
  const campaignMap = new Map();
  for (const camp of campaigns || []) {
    campaignMap.set(camp.id, camp);
  }
  
  const matchedConvs = [];
  for (const conv of convs || []) {
    const key = `${conv.tenant_id}:${conv.user_identifier}`;
    if (leadMap.has(key)) {
      const lead = leadMap.get(key);
      const camp = campaignMap.get(lead.campaign_id);
      matchedConvs.push({ conv, lead, camp });
    }
  }
  
  console.log(`Analyzing ${matchedConvs.length} matched conversations...`);
  
  const convIds = matchedConvs.map(item => item.conv.id);
  const allMessages = [];
  const chunkSize = 100;
  
  for (let i = 0; i < convIds.length; i += chunkSize) {
    const chunk = convIds.slice(i, i + chunkSize);
    const { data: msgChunk, error: msgError } = await supabase
      .from('messages')
      .select('conversation_id, sender_type, direction, content, metadata')
      .in('conversation_id', chunk);
      
    if (msgError) {
      console.error(`Error fetching messages chunk at ${i}:`, msgError);
      return;
    }
    
    allMessages.push(...(msgChunk || []));
  }
    
  console.log(`Fetched ${allMessages.length} messages total.`);
  
  // Group messages by conversation_id
  const messagesByConvId = new Map();
  for (const msg of allMessages) {
    if (!messagesByConvId.has(msg.conversation_id)) {
      messagesByConvId.set(msg.conversation_id, []);
    }
    messagesByConvId.get(msg.conversation_id).push(msg);
  }
  
  const results = {};
  for (const item of matchedConvs) {
    const campId = item.lead.campaign_id;
    const campName = item.camp?.name || 'Unknown';
    if (!results[campId]) {
      results[campId] = {
        name: campName,
        total: 0,
        conversions: []
      };
    }
    
    results[campId].total++;
    
    const messages = messagesByConvId.get(item.conv.id) || [];
      
    let conversao_por_clique = false;
    let conversao_por_chat = false;
    let cliente_respondeu = false;
    let link_enviado_ia = false;
    
    for (const msg of messages) {
      if (msg.sender_type === 'system' && msg.metadata?.event_type === 'click_conversion') {
        conversao_por_clique = true;
      }
      if (msg.content?.includes('[CONVERSÃO]') && msg.metadata?.event_type !== 'click_conversion') {
        conversao_por_chat = true;
      }
      if (msg.sender_type === 'user' && msg.direction === 'inbound') {
        cliente_respondeu = true;
      }
      if (['ai', 'bot', 'assistant', 'lia', 'system'].includes(msg.sender_type) && 
          item.camp?.success_link_filter && 
          msg.content?.includes(item.camp.success_link_filter)) {
        link_enviado_ia = true;
      }
    }
    
    // Check if converted
    const criteria = item.camp?.success_criteria || [];
    let is_converted = false;
    if (conversao_por_clique || conversao_por_chat) {
      is_converted = true;
    } else if (criteria.includes('CLIENT_RESPONDED') && cliente_respondeu) {
      is_converted = true;
    } else if (criteria.includes('LINK_SENT') && link_enviado_ia) {
      is_converted = true;
    }
    
    if (is_converted) {
      results[campId].conversions.push({
        conversao_por_clique,
        conversao_por_chat,
        cliente_respondeu
      });
    }
  }
  
  // Aggregate and print
  const output = [];
  for (const campId in results) {
    const res = results[campId];
    let clique_puro = 0;
    let conversa_pura = 0;
    let misto = 0;
    
    for (const conv of res.conversions) {
      if (conv.conversao_por_clique && !conv.conversao_por_chat && !conv.cliente_respondeu) {
        clique_puro++;
      } else if (!conv.conversao_por_clique) {
        conversa_pura++;
      } else if (conv.conversao_por_clique && (conv.conversao_por_chat || conv.cliente_respondeu)) {
        misto++;
      }
    }
    
    output.push({
      nome_campanha: res.name,
      campaign_id: campId,
      total_conversas: res.total,
      conversoes_por_clique_apenas: clique_puro,
      conversoes_por_conversa_apenas: conversa_pura,
      conversoes_mistas_engajadas: misto,
      total_conversoes_reais: res.conversions.length,
      sum_of_parts: clique_puro + conversa_pura + misto
    });
  }
  
  console.table(output);
}

run();
