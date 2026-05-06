/* 🧭 ROTEADOR DE CONTEXTO - V14.2 - ANTI-LOOP CONSOLIDADO
   - Anti-Loop: Olha para a última mensagem da Sofia para decidir se avança.
   - FAQ & CTA: Mantém toda a lógica de dúvidas e Call to Action.
   - Precision: Detecta intenções de forma mais rigorosa.
*/

const rpcData = $node["RPC - Acesso Entrada"].json;
const ctx = rpcData.context || {};
const leadInfo = ctx.lead_info || {};
const agent = ctx.agent || {};
const blueprint = agent.workflow_blueprint || { steps: {} };
const history = ctx.messages_history || [];

const currentMsg = String($json?.content ?? $json?.text ?? $json?.message ?? $json?.body ?? rpcData?.message ?? ctx?.current_message ?? "").trim();
const lastUserLower = currentMsg.toLowerCase();

// --- 1) HISTÓRICO E DETECÇÃO DE ESTADO ---
const assistantMessages = history.filter(m => 
    String(m.sender_type).toLowerCase() === 'assistant' || 
    String(m.role).toLowerCase() === 'assistant' || 
    String(m.sender).toLowerCase() === 'assistant' ||
    String(m.role).toLowerCase() === 'bot' ||
    String(m.role).toLowerCase() === 'agent' ||
    String(m.sender_type).toLowerCase() === 'ai' ||
    String(m.role).toLowerCase() === 'ai' ||
    String(m.sender_type).toLowerCase() === 'outbound' ||
    String(m.role).toLowerCase() === 'outbound' ||
    String(m.direction).toLowerCase() === 'outbound'
);

const lastSofiaMsg = String(assistantMessages[assistantMessages.length - 1]?.content || assistantMessages[assistantMessages.length - 1]?.text || "").toLowerCase();
const historyTexts = history.map(m => String(m.content || m.text || "").toLowerCase()).join(" ");

const linkAlreadySent = historyTexts.includes("clicar no link abaixo") || historyTexts.includes("fiservcapital.moneymoneyinvest") || (historyTexts.includes("solicitar análise") && historyTexts.includes("24h"));

let currentStep = 'start';
if (linkAlreadySent) {
    currentStep = 'envio_link';
} else if (lastSofiaMsg.includes("responsavel pelo cnpj") || lastSofiaMsg.includes("responsável pelo cnpj") || lastSofiaMsg.includes("confirmar uma informação") || lastSofiaMsg.includes("empresa davos")) {
    currentStep = 'verificacao_cnpj';
} else if (lastSofiaMsg.includes("sou a sofia") || lastSofiaMsg.includes("especialista da ticket") || lastSofiaMsg.includes("reforço de caixa")) {
    currentStep = 'explicacao_agente';
}

// --- 2) INTENÇÕES ---
const isAffirmative = /\b(sim|pode|manda|quero|ok|claro|enviar|perfeito|correto|isso|é ele|sou eu|confirmo|bora|aceito|tá|ta|vambora|entendi|com certeza)\b/i.test(lastUserLower);
const isNegative = /\b(não|nao|errado|incorreto|outro|mudar|não é esse)\b/i.test(lastUserLower);
const isDoubt = /\b(dúvida|duvida|como funciona|saber mais|explica|entender|oque é|o que é|golpe|seguro|fraude|confiável|taxa|juros|boleto|parcela|domicilio|domicílio|bmp|banco)\b/i.test(lastUserLower);
const isHumanRequest = /\b(pessoa|humano|atendente|vendedor|alguém|atendimento humano)\b/i.test(lastUserLower);
const isGreeting = /^(oi|ol[aá]|bom dia|boa tarde|boa noite|hello|hi|oie|opa)$/i.test(lastUserLower);

// --- 3) TRANSIÇÕES DE ESTADO ---
let nextStep = currentStep;
let transitionApplied = false;

if (currentStep === 'start') {
    if (isAffirmative) { nextStep = 'verificacao_cnpj'; transitionApplied = true; }
    else if (lastUserLower.includes("agente") || isDoubt) { nextStep = 'explicacao_agente'; transitionApplied = true; }
} else if (currentStep === 'explicacao_agente') {
    if (isAffirmative || isGreeting || isDoubt || lastUserLower.includes("entendi")) { 
        nextStep = 'verificacao_cnpj'; 
        transitionApplied = true; 
    }
} else if (currentStep === 'verificacao_cnpj' && isAffirmative) {
    nextStep = 'envio_link'; 
    transitionApplied = true;
}

// --- 4) MODO DE RESPOSTA ---
let mode = "parrot";
if (isHumanRequest || isDoubt || currentStep === 'envio_link' || (isGreeting && history.length > 2)) {
    mode = "consultive";
}

// --- 5) PROMPT FINAL ---
const basePrompt = agent.brain_config?.systemPrompt || "";
const activeConfig = blueprint.steps[nextStep] || blueprint.steps["start"];
const forcedText = String(activeConfig.rules)
    .replace(/{{lead_info\.cnpj}}/g, leadInfo.cnpj || "não informado")
    .replace(/{{lead_info\.name}}/g, leadInfo.name || "não informado")
    .replace(/{{lead_info\.link}}/g, leadInfo.link || "https://fiserv.ticket.com.br/simulacao-sofia");

let finalPrompt = "";
if (mode === "parrot") {
    finalPrompt = `<RULES>
- Responda EXATAMENTE o texto em <RESPOSTA_OBRIGATORIA>.
</RULES>

${basePrompt}

<CONTROLE_DE_FLUXO>
<RESPOSTA_OBRIGATORIA>
${forcedText}
</RESPOSTA_OBRIGATORIA>
</CONTROLE_DE_FLUXO>`;
} else {
    finalPrompt = `${basePrompt}

<CONTROLE_DE_FLUXO>
MODO CONSULTIVO ATIVO
- Responda à dúvida do usuário usando APENAS a BASE_DE_CONHECIMENTO_FAQ.
- Seja curto e direto. 
- REGRA CRÍTICA: Se link_enviado = true, termine com: "Você ainda tem alguma dúvida ou posso te ajudar com algo mais?"
- link_enviado: ${linkAlreadySent}
- Link Oficial: ${leadInfo.link}
</CONTROLE_DE_FLUXO>

JSON: {"content":"..."}`;
}

return {
  final_system_prompt: finalPrompt,
  p_conversation_id: rpcData.conversation?.id || rpcData.p_conversation_id,
  currentStep: nextStep,
  transition_applied: transitionApplied,
  mode: mode,
  debug: { 
    currentStep, 
    nextStep, 
    history_len: history.length,
    assistant_msgs_len: assistantMessages.length,
    lastSofiaMsg: lastSofiaMsg.substring(0, 50) 
  }
};
