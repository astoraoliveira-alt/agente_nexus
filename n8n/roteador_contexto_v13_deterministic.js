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
const isAgentButtonClick = /^falar com um agente!?$/i.test(lastUserLower);
const isAffirmative = /\b(sim|pode|manda|quero|ok|claro|enviar|perfeito|correto|isso|é ele|sou eu|confirmo|bora|aceito|tá|ta|vambora|entendi|com certeza)\b/i.test(lastUserLower);
const isNegative = /\b(não|nao|errado|incorreto|outro|mudar|não é esse)\b/i.test(lastUserLower);
const isDoubt = /\b(dúvida|duvida|como funciona|saber mais|explica|entender|oque é|o que é|golpe|seguro|fraude|confiável|taxa|juros|bmp|banco)\b/i.test(lastUserLower);
const isHumanRequest = /\b(pessoa|humano|atendente|vendedor|alguém|atendimento humano|agente|falar com)\b/i.test(lastUserLower);
const isGreeting = /^(oi|ol[aá]|bom dia|boa tarde|boa noite|hello|hi|oie|opa)$/i.test(lastUserLower);

// --- 3) TRANSIÇÕES DE ESTADO ---
let nextStep = currentStep;
let transitionApplied = false;

if (isAgentButtonClick) {
    nextStep = 'solicitacao_agente';
    transitionApplied = true;
} else if (currentStep === 'start') {
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
if (isAgentButtonClick) {
    mode = "parrot"; // 🔒 Força modo fixo para o botão
} else if (isHumanRequest || isDoubt || currentStep === 'envio_link' || (isGreeting && history.length > 2)) {
    mode = "consultive";
}

// --- 5) PROMPT FINAL ---
const basePrompt = agent.brain_config?.systemPrompt || "";
let activeConfig = blueprint.steps[nextStep] || blueprint.steps["start"];

// 🔒 HARD OVERRIDE: Garante resposta fixa para o botão de agente
if (isAgentButtonClick) {
    activeConfig = {
        rules: "Olá! Sou a Sofia, especialista da *Ticket*. Que bom que você quer saber mais!\n\nExplicando rapidamente: este é um reforço de caixa exclusivo para parceiros Ticket. Você pode ter de *R$ 10 mil a R$ 500 mil* com taxas a partir de *1,89% a.m.* O dinheiro cai na sua conta em até *24h* e o pagamento é feito via boleto bancário, sem comprometer seu limite de crédito.\n\n👉 Posso te enviar o link seguro para você simular o valor exato agora ou prefere tirar alguma dúvida antes? 📈"
    };
}

const forcedText = String(activeConfig.rules)
    .replace(/{{lead_info\.cnpj}}/g, leadInfo.cnpj || "não informado")
    .replace(/{{lead_info\.name}}/g, leadInfo.name || "não informado")
    .replace(/{{lead_info\.link}}/g, leadInfo.link || "https://fiserv.ticket.com.br/simulacao-sofia");

let finalPrompt = "";
if (mode === "parrot") {
    finalPrompt = `<RULES>
- Responda EXATAMENTE o texto em <RESPOSTA_OBRIGATORIA>.
- NÃO use nenhuma outra informação ou base de conhecimento.
- NÃO adicione saudações ou textos extras.
</RULES>

<CONTROLE_DE_FLUXO>
<RESPOSTA_OBRIGATORIA>
${forcedText}
</RESPOSTA_OBRIGATORIA>
</CONTROLE_DE_FLUXO>`;
} else {
    finalPrompt = `<identity>
Você é Sofia, consultora sênior da Ticket Edenred.
Sua comunicação deve ser impecável: profissional, segura e visualmente organizada para WhatsApp.
</identity>

<diretrizes_estilo_visual>
- NEGRITO: Use *asteriscos* para destacar termos importantes (Ex: *Boleto Bancário*, *Sem conta nova*, *24 parcelas*).
- EMOJIS: Máximo de 1 emoji por mensagem, sempre no final ou início, nunca no meio do texto.
- PARÁGRAFOS: Use quebras de linha para não criar "paredões" de texto.
</diretrizes_estilo_visual>

<BASE_DE_CONHECIMENTO_FAQ>
[DOMICÍLIO BANCÁRIO / BMP]: "O domicílio bancário é apenas o banco onde sua movimentação financeira é gerenciada. No nosso caso, o Banco BMP é uma *conta técnica* utilizada apenas para gerenciar a garantia da operação. O dinheiro transferido para lá é imediatamente repassado para a sua conta habitual de sempre. Isso significa que você *não altera sua rotina* bancária!"

[PAGAMENTO / CARTÃO]: "O pagamento é feito exclusivamente por *boleto bancário* em até *24 parcelas*. Não há débito automático ou uso de cartão de crédito para as parcelas, garantindo que você mantenha o controle total do seu caixa."

[TAXAS E JUROS]: "Cada cliente tem uma proposta personalizada para o seu perfil. Trabalhamos com taxas entre *1,89% a.m. a 3,28% a.m* e prazo de pagamento de até 24 meses. Você precisará realizar a simulação no link oficial para verificar sua taxa exata."

[SEGURANÇA / GOLPE]: "Pode ficar tranquilo(a), não é golpe. Este link é oficial da parceria entre a Ticket e a Fiserv Capital. Você pode validar esta informação diretamente pelo Portal Ticket, pela Central de Atendimento no número *4004-2233* ou pelo site *ticket.com.br/estabelecimento*."

[FALAR COM HUMANO]: "Com certeza. Vou solicitar para que um assessor entre em contato com você pelo WhatsApp em até *2 dias úteis*. Enquanto isso, se tiver alguma dúvida pontual, posso te ajudar por aqui também."
</BASE_DE_CONHECIMENTO_FAQ>

<REGRA_CTA_OBRIGATORIA>
Sempre que o link de simulação já tiver sido enviado na conversa, você deve OBRIGATORIAMENTE terminar sua resposta pulando uma linha e fazendo a seguinte pergunta:
"*Você ainda tem alguma dúvida ou posso te ajudar com algo mais?*"
</REGRA_CTA_OBRIGATORIA>

<instrucao_de_manejo_de_dúvida>
Se o cliente insistir em simular com você (Ex: "quero fazer aqui"):
- Explique: "*${leadInfo.name || 'Parceiro'}, eu adoraria fazer por aqui, mas como a análise da Fiserv consulta seus recebíveis em tempo real para te dar a melhor taxa, ela precisa ser feita no ambiente seguro do site oficial. É super rápido e protege seus dados!*"
</instrucao_de_manejo_de_dúvida>

<regra_de_ouro>
NUNCA invente taxas ou condições. Se a dúvida for sobre o funcionamento técnico, use APENAS os textos da BASE_DE_CONHECIMENTO_FAQ acima.
</regra_de_ouro>

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
