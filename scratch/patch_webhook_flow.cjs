const fs = require('fs');
const path = require('path');

const jsonFilePath = '/Users/user/SaaS - Davos Nexus/agent-nexus-hub/database/json n8n/Receptor Webhook Fiserv - STATUS.json';

try {
    const flowData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

    let dbSearchUpdated = false;
    let msgClassUpdated = false;
    let dbUpdateUpdated = false;

    flowData.nodes.forEach(node => {
        if (node.name === 'Buscar Lead no DB') {
            node.parameters.query = `SELECT id, tenant_id, agent_id, campaign_id, identifier AS cnpj, whatsapp AS phone, name, metadata
FROM public.agent_leads
WHERE (metadata->>'loan_request_id')::text = '{{ $json.body.id }}'::text
LIMIT 1;`;
            dbSearchUpdated = true;
            console.log('Buscar Lead no DB node query updated to use $json.body.id.');
        }

        if (node.name === 'Classificar e Montar Mensagem') {
            node.parameters.jsCode = `const r = $json; // Subworkflow output
let lead = {};
try {
  lead = $('Buscar Lead no DB').first().json;
} catch (e) {
  lead = {};
}

const status = r.status || (r.data && r.data.status) || '';
const APPROVED = ['approved','in_quoting','comite','comite_approved','formalization','won'];
const DENIED = ['denied','fails_to_process','lost','cancelled'];

let outcome = 'pending';
if (APPROVED.includes(status)) {
  outcome = 'offer';
} else if (DENIED.includes(status)) {
  outcome = 'rejected';
}

const decided = outcome !== 'pending';
const currentMetadata = lead.metadata || {};
const alreadySent = currentMetadata.fiserv_offer_sent === true || currentMetadata.fiserv_offer_sent === 'true';

const name = lead.name || 'Parceiro';
let message = '';
if (outcome === 'offer' && !alreadySent) {
  const amount = r.offer_data?.SomaPrincipal || r.data?.offer_data?.SomaPrincipal || r.data?.amount || r.amount || '';
  const term = r.offer_data?.installments || r.data?.offer_data?.installments || r.data?.installments || r.installments || '';
  const tax = r.offer_data?.PercJurosMensal || r.data?.offer_data?.PercJurosMensal || '';
  
  message = \`Olá, *\${name}*! Sou a Sofia da Ticket. 📈\\n\\nTemos ótimas notícias! A Fiserv pré-aprovou uma oferta de crédito para o seu estabelecimento:\\n\\n💵 *Limite Pré-Aprovado:* R$ \${Number(amount).toLocaleString('pt-BR', {minimumFractionDigits: 2})}\\n📅 *Prazo:* em até \${term} parcelas\\n📉 *Taxa:* a partir de \${tax}% a.m.\\n\\nPodemos fazer a simulação de valores e parcelas diretamente por aqui no chat, sem complicação!\\n\\n*Você gostaria de iniciar a simulação?*\`;
} else if (outcome === 'rejected' && !alreadySent) {
  message = \`Olá, *\${name}*! Sou a Sofia da Ticket. 📈\\n\\nAnalisamos suas informações junto à Fiserv e, no momento, não conseguimos liberar uma oferta pré-aprovada de crédito para o seu CNPJ.\\n\\nNão se preocupe, pois a análise é atualizada mensalmente. Caso tenhamos ofertas disponíveis no futuro, entraremos em contato com você!\`;
}

return [{
  json: {
    lead_id: lead.id,
    tenant_id: lead.tenant_id,
    agent_id: lead.agent_id,
    campaign_id: lead.campaign_id,
    cnpj: lead.cnpj,
    contact_name: name,
    contact_phone: lead.phone,
    loan_request_id: r.loan_request_id || lead.metadata?.loan_request_id,
    status,
    external_status: r.external_status || '',
    offer_data: r.offer_data || null,
    outcome,
    decided: decided && !alreadySent,
    message_content: message
  }
}];`;
            msgClassUpdated = true;
            console.log('Classificar e Montar Mensagem JS code updated with fallback variables.');
        }

        if (node.name === 'Atualizar status no DB') {
            node.parameters.query = `UPDATE agent_leads
SET metadata = metadata
   || jsonb_build_object('fiserv_status', '{{ $json.status }}'::text)
   || jsonb_build_object('fiserv_external_status', '{{ ($json.external_status || "") }}'::text)
   || (CASE WHEN '{{ $json.decided }}' = 'true' THEN jsonb_build_object('fiserv_offer_sent', 'true') ELSE '{}'::jsonb END)
WHERE id = '{{ $json.lead_id }}'
  AND tenant_id = '{{ $json.tenant_id }}'::uuid;`;
            dbUpdateUpdated = true;
            console.log('Atualizar status no DB query updated with tenant isolation.');
        }
    });

    if (dbSearchUpdated || msgClassUpdated || dbUpdateUpdated) {
        fs.writeFileSync(jsonFilePath, JSON.stringify(flowData, null, 2), 'utf8');
        console.log('✅ Webhook flow file updated successfully!');
    } else {
        console.log('⚠️ No changes were made to the Webhook flow file.');
    }

} catch (error) {
    console.error('Error patching webhook flow:', error);
}
