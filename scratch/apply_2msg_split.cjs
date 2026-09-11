const fs = require('fs');

// 1. Sincronizar ROTEADOR_PRONTO.js com pre_message
const roteadorCode = fs.readFileSync('database/json n8n/ROTEADOR_PRONTO.js', 'utf8');

const nexusPath = 'database/json n8n/Agente Nexus - Whatts Fila (FISERV_TICKET) TESTE (5).json';
const nexus = JSON.parse(fs.readFileSync(nexusPath, 'utf8'));

// Atualizar Roteador de Contexto
const roteadorNode = nexus.nodes.find(n => n.name === 'Roteador de Contexto');
if (roteadorNode) {
    roteadorNode.parameters.jsCode = roteadorCode;
}

// Atualizar Code in JavaScript1 no fluxo principal para suportar 2 mensagens se pre_message existir
const codeJs1 = nexus.nodes.find(n => n.name === 'Code in JavaScript1');
if (codeJs1) {
    codeJs1.parameters.jsCode = `/* 
  🛡️ N8N OUTPUT GUARDRAILS - V10.7 (Detecção Inteligente + Suporte a 2 Mensagens Sequenciais para Botões LGPD)
*/

// 1. Captura segura do Roteador
let rpcData = {};
try {
    rpcData = $('Roteador de Contexto').first()?.json || {};
} catch(e) {}

const currentItem = $input.first().json;
let msgText = null;
let cameFromAI = false;
let rawAIPayload = null;

// =========================================================
// DESCOBERTA DE ROTA
// =========================================================

try {
    rawAIPayload = $('Edit Fields Normaliza Conversation FINAL1').first();
    if (rawAIPayload) { cameFromAI = true; }
} catch (e) {}

if (!msgText && !cameFromAI) {
    try {
        const nodeSimulacao = $('Formatar Resposta').first()?.json;
        if (nodeSimulacao) { msgText = nodeSimulacao.output || nodeSimulacao.message || nodeSimulacao.content; }
    } catch(e) {}
}

if (!msgText && !cameFromAI) {
    try {
        const nodeLead = $('Prepara Mensagem WhatsApp').first()?.json;
        if (nodeLead) { msgText = nodeLead.output || nodeLead.message || nodeLead.content; }
    } catch(e) {}
}

if (!msgText && !cameFromAI) {
    msgText = currentItem.output || currentItem.message || currentItem.final_system_prompt || currentItem.content;
}

const interactiveButtons = rpcData.interactive_buttons || currentItem.interactive_buttons || null;

if (!cameFromAI) {
    if (typeof msgText === 'string') {
        msgText = msgText.replace(/\\n/g, '\\n');
    }
    
    // Se há pre_message em interactive_buttons, desmembrar em 2 mensagens sequenciais
    if (interactiveButtons && interactiveButtons.pre_message) {
        return [
            {
                is_blocked: false,
                message: interactiveButtons.pre_message,
                transition_target: rpcData.currentStep || null,
                original_ai_payload: interactiveButtons.pre_message,
                interactive_buttons: null
            },
            {
                is_blocked: false,
                message: msgText || "Desculpe, ocorreu uma falha ao gerar a resposta.",
                transition_target: rpcData.currentStep || null,
                original_ai_payload: msgText || "Sem payload",
                interactive_buttons: { ...interactiveButtons, pre_message: null }
            }
        ];
    }

    return [{
        is_blocked: false,
        message: msgText || "Desculpe, ocorreu uma falha ao gerar a resposta.",
        transition_target: rpcData.currentStep || null,
        original_ai_payload: msgText || "Sem payload",
        interactive_buttons: interactiveButtons
    }];
}

// =========================================================
// ROTA AGENTE LANGCHAIN (Limpeza Profunda)
// =========================================================
const rawResponse = currentItem.ai_response || rawAIPayload?.json?.ai_response || currentItem.output || "";
let originalRaw = String(rawResponse);

function deepCleanMessage(text) {
    if (!text) return "";
    let current = text.trim();
    current = current.replace(/\`\`\`json/gi, '').replace(/\`\`\`/gi, '').trim();

    try {
        const parsed = JSON.parse(current);
        if (typeof parsed === 'object' && parsed !== null) {
            const inner = parsed.content || parsed.message || parsed.output || parsed.text || JSON.stringify(parsed);
            return deepCleanMessage(inner);
        }
    } catch (e) {}

    const contentRegex = /"(?:content|message|output|text)":\\s*"([\\s\\S]*?)"(?:\\s*[,}])?$/i;
    const match = current.match(contentRegex);
    if (match && match[1]) { return deepCleanMessage(match[1]); }
    return current;
}

let msg = deepCleanMessage(originalRaw);
const transitionMatch = msg.match(/\\[TRANSITION_TO[:\\s]+(\\w+)\\]/i);
const transitionTarget = transitionMatch ? transitionMatch[1].trim() : null;

msg = msg
    .replace(/\\[TRANSITION_TO[:\\s]+\\w+\\]/gi, '') 
    .replace(/\\n/g, '\\n')                       
    .replace(/\\"/g, '"')                        
    .replace(/^["' :{}]+|["' {}]+$/g, '')        
    .trim();

let blocked = false;
if (msg.length < 2) {
    blocked = true;
    msg = "Puxa, não consegui processar essa informação agora. Poderia repetir?";
} else if (/prompt de sistema|minhas instruções|ignore as instruções/i.test(msg)) {
    blocked = true;
    msg = "Desculpe, sou um assistente virtual e não estou autorizado a compartilhar detalhes técnicos.";
}

if (interactiveButtons && interactiveButtons.pre_message) {
    return [
        {
            is_blocked: blocked,
            message: interactiveButtons.pre_message,
            transition_target: transitionTarget || rpcData.currentStep,
            p_current_step: transitionTarget || rpcData.currentStep,
            original_ai_payload: interactiveButtons.pre_message,
            interactive_buttons: null
        },
        {
            is_blocked: blocked,
            message: msg,
            transition_target: transitionTarget || rpcData.currentStep,
            p_current_step: transitionTarget || rpcData.currentStep,
            original_ai_payload: originalRaw,
            interactive_buttons: { ...interactiveButtons, pre_message: null }
        }
    ];
}

return [{
    is_blocked: blocked,
    message: msg,
    transition_target: transitionTarget,
    p_current_step: transitionTarget || rpcData.currentStep,
    original_ai_payload: originalRaw,
    interactive_buttons: interactiveButtons
}];`;
}

// Garante que Envia Msg repasse interactive_buttons
const enviaMsg = nexus.nodes.find(n => n.name === 'Envia Msg');
if (enviaMsg && enviaMsg.parameters && enviaMsg.parameters.workflowInputs && enviaMsg.parameters.workflowInputs.value) {
    enviaMsg.parameters.workflowInputs.value.interactive_buttons = `={{ $('Code in JavaScript1').isExecuted ? $('Code in JavaScript1').item.json.interactive_buttons : ($json.interactive_buttons || null) }}`;
}

fs.writeFileSync(nexusPath, JSON.stringify(nexus, null, 2), 'utf8');
console.log('Agente Nexus workflow JSON updated successfully with 2-message sequential capability!');

// 2. Atualizar UTIL - Send WhatsApp Message (1).json para também saber desmembrar
const utilPath = 'database/json n8n/UTIL - Send WhatsApp Message (1).json';
const util = JSON.parse(fs.readFileSync(utilPath, 'utf8'));
const normInput = util.nodes.find(n => n.name === 'Normalize Input');
if (normInput) {
    normInput.parameters.jsCode = `// 🔒 Validação mínima
if (!$json.phone) {
  throw new Error("❌ phone não informado");
}

if (!$json.message && !$json.template_id) {
  throw new Error("❌ message ou template_id não informado");
}

// 🔄 Normalização
const phone = String($json.phone)
  .replace('@c.us', '')
  .replace(/\\D/g, '');

const provider = String($json.provider || 'evolution')
  .toLowerCase()
  .trim();

const allowedProviders = ['evolution', 'meta', 'zenvia'];
if (!allowedProviders.includes(provider)) {
  throw new Error(\`❌ provider inválido: \${provider}\`);
}

const meta_token = $json.meta_api_token || null;
const meta_phone_id = $json.meta_phone_number_id || null;
const zenvia_api_token = $json.zenvia_api_token || null;
const zenvia_channel_id = $json.zenvia_channel_id || null;
const template_id = $json.template_id || null;
const zenvia_image_url = $json.zenvia_image_url || null;
const cta_link = $json.cta_link || null;
const interactive_buttons = $json.interactive_buttons || null;
let final_message = $json.message;

// 🚀 Se interactive_buttons possui pre_message, retorna 2 itens sequenciais (Mensagem de Texto -> Mensagem de Botão)
if (interactive_buttons && interactive_buttons.pre_message) {
  return [
    {
      json: {
        ...$json,
        phone,
        provider,
        message: interactive_buttons.pre_message,
        meta_token,
        meta_phone_id,
        zenvia_api_token,
        zenvia_channel_id,
        template_id,        
        zenvia_image_url,   
        cta_link,
        interactive_buttons: null
      }
    },
    {
      json: {
        ...$json,
        phone,
        provider,
        message: final_message,
        meta_token,
        meta_phone_id,
        zenvia_api_token,
        zenvia_channel_id,
        template_id,        
        zenvia_image_url,   
        cta_link,
        interactive_buttons: { ...interactive_buttons, pre_message: null }
      }
    }
  ];
}

return [
  {
    json: {
      ...$json,
      phone,
      provider,
      message: final_message,
      meta_token,
      meta_phone_id,
      zenvia_api_token,
      zenvia_channel_id,
      template_id,        
      zenvia_image_url,   
      cta_link,
      interactive_buttons
    }
  }
];`;
}

fs.writeFileSync(utilPath, JSON.stringify(util, null, 2), 'utf8');
console.log('UTIL - Send WhatsApp Message updated successfully!');
