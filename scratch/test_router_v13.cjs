// 🧪 TESTE DE ROTEADOR DETERMINÍSTICO V13
// Simula a lógica do n8n para verificar se a transição ocorre corretamente.

const fs = require('fs');
const path = require('path');

// Mock do n8n $node["RPC - Acesso Entrada"].json
const mockRpcData = {
    context: {
        conversation: {
            id: "conv_123",
            context_state: {
                current_step: "verificacao_cnpj"
            }
        },
        lead_info: {
            name: "DAVOS AD",
            cnpj: "98589096000501",
            link: "https://fiserv.ticket.com.br/simulacao-sofia"
        },
        messages_history: [
            { sender_type: "assistant", content: "Perfeito! Antes de seguir, preciso apenas confirmar uma informação: estou falando com o responsável pelo CNPJ *98589096000501* da empresa *DAVOS AD CONSULTORIA E ASSESSORIA EMPRESARIAL LTDA*?" },
            { sender_type: "user", content: "Sim, sou eu!" }
        ],
        agent: {
            brain_config: {
                systemPrompt: "Você é Sofia..."
            },
            workflow_blueprint: JSON.parse(fs.readFileSync(path.join(__dirname, '../sofia_full_config.json'), 'utf8')).workflow_blueprint
        }
    }
};

// --- INÍCIO DO CÓDIGO DO ROTEADOR ---
const rpcData = mockRpcData;
const ctx = rpcData.context || {};
const leadInfo = ctx.lead_info || {};
const agent = ctx.agent || {};
const blueprint = agent.workflow_blueprint || { steps: {} };
const history = ctx.messages_history || [];
const convState = ctx.conversation?.context_state || {};

let currentStep = convState.current_step || blueprint.initial_step || 'start';
const stepConfig = blueprint.steps[currentStep] || {};

const lastInbound = history.filter(m => m.sender_type === 'user').pop()?.content || "";
const isAffirmative = /sim|pode|manda|quero|ok|claro|enviar|perfeito|correto|isso|é ele/i.test(lastInbound);
const isNegative = /não|nao|errado|incorreto|outro|mudar/i.test(lastInbound);

let nextStep = currentStep;
let transitionApplied = false;

if (currentStep === 'start' && isAffirmative) {
    nextStep = 'verificacao_cnpj';
    transitionApplied = true;
} else if (currentStep === 'verificacao_cnpj') {
    if (isAffirmative) {
        nextStep = 'envio_link';
        transitionApplied = true;
    } else if (isNegative) {
        nextStep = 'coleta_cnpj_correto';
        transitionApplied = true;
    }
}

const activeStep = blueprint.steps[nextStep] || stepConfig;
let currentObjective = activeStep.rules || "";

currentObjective = currentObjective
    .replace(/{{lead_info.name}}/g, leadInfo.name || 'Cliente')
    .replace(/{{lead_info.cnpj}}/g, leadInfo.cnpj || 'CNPJ')
    .replace(/{{lead_info.link}}/g, leadInfo.link || 'https://fiserv.ticket.com.br/simulacao-sofia');

console.log("=== RESULTADO DO TESTE ===");
console.log("Passo Atual:", currentStep);
console.log("User Input:", lastInbound);
console.log("Confirmado:", isAffirmative);
console.log("Próximo Passo:", nextStep);
console.log("Transição Aplicada:", transitionApplied);
console.log("Objetivo Final:", currentObjective);

if (nextStep === 'envio_link') {
    console.log("✅ SUCESSO: O link será enviado!");
} else {
    console.log("❌ FALHA: O link não será enviado.");
}
