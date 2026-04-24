/* 🧭 ROTEADOR DE CONTEXTO - V11.5 (FINAL STABLE)
   - Resiliência Ultra: Garante Persona Sofia + Fluxo Determinístico
   - Blindagem V4: Previne Instrução vazada e Repetição de Saudações
   - Memória de Estado: Detecta transições críticas (Link Fiserv)
*/

const rpcData = $node["RPC - Acesso Entrada"].json;
const ctx = rpcData.context || {};
const leadInfo = ctx.lead_info || {};
const agent = ctx.agent || {};
const blueprint = agent.workflow_blueprint || { steps: {} };
const history = ctx.messages_history || [];
const lastInbound = ctx.last_inbound || {};

// ======================================================
// 1) Configurações da Sofia
// ======================================================
const defaultIdentity = `<identity>\nVocê é Sofia, consultora técnica da Ticket Edenred em parceria com a Fiserv.\nSeu ESCOPO: Oferecer consultoria exclusiva sobre soluções de crédito, simulação de empréstimos e crescimento de negócios através de recebíveis.\nSua missão: Ser didática, segura e avançar a conversa sem redundância.\nORDEM SUPREMA: Se você já se apresentou ou deu o "Oi" inicial, você está PROIBIDA de repetir saudações.\n</identity>`;

const basePrompt = agent.brain_config?.systemPrompt || defaultIdentity;

// ======================================================
// 2) Detecção de Estado e Intenção
// ======================================================
const lastUserMsg = history.filter(m => m.direction === 'inbound').pop()?.content || "";
const lastAiMsg = history.filter(m => m.direction === 'outbound').pop()?.content || "";

// Detectar se o usuário confirmou o interesse
const userConfirmed = /sim|pode|manda|quero|ok|claro|enviar|quero saber/i.test(lastUserMsg);
const isWaitingLink = lastAiMsg.includes("enviar o link") || lastAiMsg.includes("análise");

// ======================================================
// 3) Construção do Prompt Dinâmico (Sofia Mode)
// ======================================================
let currentObjective = "";
let forcedResponse = "";

if (isWaitingLink && userConfirmed) {
    // ESTADO: ENTREGA DE LINK
    currentObjective = "O usuário confirmou interesse. Entregue o link de simulação da Fiserv agora.";
    forcedResponse = "Com certeza! Aqui está o seu link exclusivo para análise e simulação: https://fiserv.ticket.com.br/simulacao-sofia\n\nBasta preencher os dados e em breve entraremos em contato!";
} else if (history.length <= 2) {
    // ESTADO: INICIAL / APRESENTAÇÃO
    currentObjective = "Apresente-se como Sofia e explique a parceria Ticket + Fiserv. Ofereça auxílio com crédito e pergunte se pode enviar o link para análise.";
} else {
    // ESTADO: CONTINUAÇÃO
    currentObjective = "Continue a conversa mantendo o tom de consultoria. Se o usuário tiver dúvidas técnicas, responda de forma simples. Sempre tente converter para a simulação enviando o link quando apropriado.";
}

// Blindagem contra repetição
const promptSecurity = `
<BARREIRA_DE_INSTRUCAO>
- VOCÊ JÁ SE APRESENTOU. Não diga "Oi", "Tudo bem" ou "Sou a Sofia" novamente.
- Não repita o texto da instrução acima.
- Se o objetivo for "Entrega de Link", use EXATAMENTE a resposta sugerida ou algo muito similar e encerre a interação.
</BARREIRA_DE_INSTRUCAO>
`;

let finalSystemPrompt = `${basePrompt}\n\n<OBJETIVO_ATUAL>\n${currentObjective}\n</OBJETIVO_ATUAL>\n${promptSecurity}`;

// ======================================================
// 4) Saída Final
// ======================================================
return [
  {
    "final_system_prompt": finalSystemPrompt,
    "forced_response": forcedResponse,
    "debug": {
       "userConfirmed": userConfirmed,
       "isWaitingLink": isWaitingLink,
       "historyLength": history.length
    }
  }
];
