const fs = require('fs');
const path = require('path');

const jsFilePath = '/Users/user/SaaS - Davos Nexus/agent-nexus-hub/n8n/roteador_contexto_v13_deterministic.js';
const jsonFilePath = '/Users/user/SaaS - Davos Nexus/agent-nexus-hub/database/json n8n/Agente Nexus - Whatts Fila (FISERV_TICKET) TESTE (1).json';

try {
    // 1. Read JS Code
    let jsCode = fs.readFileSync(jsFilePath, 'utf8');

    // Make sure the JS code returns lead_info in the output
    if (!jsCode.includes('lead_info: {')) {
        console.log('Injecting lead_info return in JS code...');
        const targetString = 'revenue: revenue,';
        const replacementString = `lead_info: {
            cnpj: leadInfo.cnpj,
            phone: leadInfo.phone,
            name: leadInfo.name,
            revenue: revenue || leadInfo.revenue,
            requested_amount: requested_amount || leadInfo.requested_amount
        },
        revenue: revenue,`;
        jsCode = jsCode.replace(targetString, replacementString);
        fs.writeFileSync(jsFilePath, jsCode, 'utf8');
        console.log('JS file updated with lead_info injection.');
    }

    // 2. Read JSON Flow
    const flowData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

    let routerUpdated = false;
    let setUpdated = false;
    let postgresUpdated = false;

    // 3. Process nodes
    flowData.nodes.forEach(node => {
        if (node.name === 'Roteador de Contexto') {
            node.parameters.jsCode = jsCode;
            routerUpdated = true;
            console.log('Roteador de Contexto node jsCode updated.');
        }

        if (node.name === 'Set (Prepara Fiserv)') {
            const assignments = node.parameters.assignments.assignments;
            const hasContactName = assignments.some(a => a.name === 'contact_name');
            if (!hasContactName) {
                assignments.push({
                    id: 'contact-name-auto-gen-id',
                    name: 'contact_name',
                    value: '={{ $json.lead_info.name || $(\'Roteador de Contexto\').first().json.lead_info?.name }}',
                    type: 'string'
                });
                setUpdated = true;
                console.log('contact_name assignment added to Set (Prepara Fiserv).');
            }
        }

        if (node.name === 'Postgres Carimbo') {
            node.parameters.query = `UPDATE agent_leads
SET metadata = metadata || jsonb_build_object(
    'loan_request_id', '{{ $json.loan_request_id }}',
    'fiserv_status', 'in_progress',
    'fiserv_requested_at', extract(epoch from now())
)
WHERE 
    phone = '{{ $(\'Roteador de Contexto\').first().json.lead_info?.phone || $node["RPC - Acesso Entrada"].json.context.lead_info.phone }}'
    AND tenant_id = '{{ $(\'Edit Fields\').first().json.tenant_id }}';`;
            postgresUpdated = true;
            console.log('Postgres Carimbo query updated to template string syntax.');
        }
    });

    // 4. Save updated JSON Flow
    if (routerUpdated || setUpdated || postgresUpdated) {
        fs.writeFileSync(jsonFilePath, JSON.stringify(flowData, null, 2), 'utf8');
        console.log('✅ JSON flow file updated successfully!');
    } else {
        console.log('⚠️ No changes were made to the JSON flow file.');
    }

} catch (error) {
    console.error('Error during compile:', error);
}
