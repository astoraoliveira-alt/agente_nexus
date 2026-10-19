/* 
  🛡️ N8N OUTPUT GUARDRAILS - V10.9 (Botões da Simulação — herda interactive_buttons de "Formatar Resposta")
  + STOP FLOW GUARD (Anti-Loop / Circuit Breaker)
*/

// 1. Captura segura do Roteador
let rpcData = {};
try {
    rpcData = $('Roteador de Contexto').first()?.json || {};
} catch(e) {}

const currentItem = $input.first().json;

// 🛡️ STOP FLOW GUARD: Se o fluxo foi interrompido pelo Roteador, NUNCA enviar mensagem
if (rpcData.stop_flow === true || rpcData.currentStep === 'stop_flow' || rpcData.is_auto_reply === true || currentItem.stop_flow === true) {
    return [];
}

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

// 2. Captura segura dos botões vindos do node "Formatar Resposta" (resultado da simulação)
// NOVO: antes só olhava o Roteador de Contexto e o item de entrada imediato — a mensagem de
// simulação passa por "Gravar Estado Simulacao" (HTTP Request) antes de chegar aqui, que
// substitui o item e perde o campo interactive_buttons. Por isso buscamos direto na origem.
let simInteractiveButtons = null;
try {
    simInteractiveButtons = $('Formatar Resposta').first()?.json?.interactive_buttons || null;
} catch(e) {}

const interactiveButtons = rpcData.interactive_buttons || simInteractiveButtons || currentItem.interactive_buttons || null;

if (!cameFromAI) {
    if (typeof msgText === 'string') {
        msgText = msgText.replace(/\\n/g, '\n');
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
    current = current.replace(/```json/gi, '').replace(/```/gi, '').trim();

    try {
        const parsed = JSON.parse(current);
        if (typeof parsed === 'object' && parsed !== null) {
            const inner = parsed.content || parsed.message || parsed.output || parsed.text || JSON.stringify(parsed);
            return deepCleanMessage(inner);
        }
    } catch (e) {}

    const contentRegex = /"(?:content|message|output|text)":\s*"([\s\S]*?)"(?:\s*[,}])?$/i;
    const match = current.match(contentRegex);
    if (match && match[1]) { return deepCleanMessage(match[1]); }
    return current;
}

let msg = deepCleanMessage(originalRaw);
const transitionMatch = msg.match(/\[TRANSITION_TO[:\s]+(\w+)\]/i);
const transitionTarget = transitionMatch ? transitionMatch[1].trim() : null;

msg = msg
    .replace(/\[TRANSITION_TO[:\s]+\w+\]/gi, '') 
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')                        
    .replace(/^["' :{}]+|["' {}]+$/g, '')        
    .trim();

// 🛡️ FILTRO DE SANITIZAÇÃO DE LINKS FICTÍCIOS / EXAMPLE.COM
msg = msg.replace(/\[([^\]]+)\]\(https?:\/\/(?:www\.)?example\.com[^\)]*\)/gi, '$1');
msg = msg.replace(/https?:\/\/(?:www\.)?example\.com[^\s]*/gi, '');
msg = msg.replace(/🔗\s*$/gm, '').trim();

let blocked = false;
if (msg.length < 2) {
    blocked = true;
    msg = "Puxa, não consegui processar essa informação agora. Poderia repetir?";
} else if (/prompt de sistema|minhas instruções|ignore as instruções/i.test(msg)) {
    blocked = true;
    msg = "Desculpe, sou um assistente virtual e não estou autorizado a compartilhar detalhes técnicos.";
}

return [{
    is_blocked: blocked,
    message: msg,
    transition_target: transitionTarget,
    p_current_step: transitionTarget || rpcData.currentStep,
    original_ai_payload: originalRaw,
    interactive_buttons: interactiveButtons
}];
