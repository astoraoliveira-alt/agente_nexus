# Refatoração da Arquitetura: Delegando a Inteligência para a LLM

Para acabar de vez com os `includes()` e textos fixos (que são frágeis e quebram quando a IA muda uma palavra), vamos transformar sua **LLM de Intenção** em um verdadeiro "Maestro". 

Ela não vai apenas dizer a intenção, mas também extrair os valores (dinheiro, parcelas) e identificar em que ponto do funil a conversa está.

---

### 1. Novo Pré-Classificador (JS Node)
Como a LLM vai descobrir o passo, o pré-classificador fica super limpo, apenas preparando o terreno.

```javascript
// PRÉ-ROTEADOR: Prepara o histórico limpo para a LLM de Intenção
const rpcData = $node["RPC - Acesso Entrada"].json; 
const history = rpcData.context?.messages_history || [];

return {
  ...$input.item.json,
  estado_calculado: { 
      // Não precisamos mais de if/else aqui. Apenas passamos o passo salvo no DB como dica.
      step_from_db: rpcData.currentStep || 'start'
  }
};
```

---

### 2. Novo System Prompt da LLM de Intenção
Adicionamos campos ao JSON para ela fazer o trabalho de extração que o JS tentava fazer de forma engessada.

**Prompt Substituído:**
```text
Você é a Sofia (Supervisor Agent), o cérebro de roteamento de um assistente de crédito da Ticket (Fiserv).
Sua ÚNICA função é analisar a intenção do usuário no contexto da conversa, extrair parâmetros financeiros se existirem, e determinar em que passo o fluxo está.

## REGRAS DE ESTRATÉGIA (strategy)
1. EXACT_FAQ: Dúvida com resposta fixa no FAQ.
2. DYNAMIC_FAQ: Dúvida que requer interpretação.
3. INSTITUTIONAL_FAQ: Dúvida sobre o Portal Ticket/Senhas.
4. OUT_OF_SCOPE: Assuntos não relacionados.
5. CONVERSION_LINK / SIMULATION_REQUEST: Pedido para simular, aceitou receber proposta, ou informou valores de simulação.
6. START_CONVERSATION: Saudação inicial pura.
7. COMPLAINT_RECOVERY: Cliente frustrado ou reclamando.
8. HUMAN_HANDOFF: Cliente pede para falar com humano.
9. VERIFY_IDENTITY: Cliente disse SIM à oferta inicial.
10. CNPJ_BLOCKED: CNPJ divergente.
11. WAIT_AND_RETURN: Vai pensar/voltar depois.
12. OPTIN_ACCEPTED: Concordou com os termos da Fiserv (Sim, autorizo, aceito).

## REGRAS DO PASSO ATUAL (current_funnel_step)
Identifique qual foi a intenção da ÚLTIMA mensagem enviada pelo Bot (Sofia) para o cliente:
- "start": Pitch inicial oferecendo crédito.
- "explicacao_agente": Explicou o que é e perguntou se quer simular.
- "verificacao_cnpj": Pediu para confirmar se o CNPJ está correto.
- "consentimento_optin": Enviou o texto legal da Fiserv pedindo "SIM/ACEITO".
- "aguardando_fiserv": Avisou que mandou pro comitê e pediu para aguardar.
- "apresenta_ofertas": Mostrou as taxas/limites e perguntou valor e parcelas.
- "confirmacao_cliente": Pediu para o cliente confirmar se as parcelas estão boas.

## OUTPUT OBRIGATÓRIO (JSON PURO)
Retorne APENAS este JSON:
{
  "strategy": "NOME_DA_ESTRATEGIA",
  "current_funnel_step": "PASSO_IDENTIFICADO_ACIMA",
  "extracted_amount": 100000, // Número puro do valor solicitado (ou null se não informou)
  "extracted_installments": 10, // Número de parcelas (ou null se não informou)
  "reasoning": "Sua justificativa"
}
```

---

### 3. O Novo Roteador (Sem Regex Mágico)
O código fica com metade do tamanho e 10x mais inteligente, pois apenas confia no JSON gerado pela LLM.

```javascript
/* 🧭 ROTEADOR DE CONTEXTO V20 - IMPULSIONADO PELA LLM DE INTENÇÃO */

try {
    const rpcData = $node["RPC - Acesso Entrada"].json;
    const ctx = rpcData.context || {};
    const leadInfo = ctx.lead_info || {};

    // 1. LÊ A RESPOSTA DA LLM DE INTENÇÃO DIRETAMENTE
    let semanticIntent = "OTHER";
    let semanticStep = rpcData.currentStep || "start";
    let requested_amount = leadInfo.requested_amount || null;
    let requested_installments = leadInfo.requested_installments || null;

    try {
        const llmOutputStr = $('Message a model1').first()?.json?.output?.[0]?.content?.[0]?.text || "";
        const startIdx = llmOutputStr.indexOf('{');
        const endIdx = llmOutputStr.lastIndexOf('}');
        if (startIdx >= 0 && endIdx >= 0) {
            const parsed = JSON.parse(llmOutputStr.substring(startIdx, endIdx + 1));
            semanticIntent = parsed.strategy || "OTHER";
            semanticStep = parsed.current_funnel_step || semanticStep;
            
            if (parsed.extracted_amount) requested_amount = parsed.extracted_amount;
            if (parsed.extracted_installments) requested_installments = parsed.extracted_installments;
        }
    } catch (e) { }

    let currentStep = semanticStep;
    let nextStep = currentStep;
    let transitionApplied = false;

    // 2. LÓGICA DE TRANSIÇÃO (Baseada nas intenções mapeadas pela LLM)
    const isAffirmative = ["VERIFY_IDENTITY", "CONVERSION_LINK", "SIMULATION_REQUEST", "OPTIN_ACCEPTED"].includes(semanticIntent);
    const isDoubt = ["EXACT_FAQ", "DYNAMIC_FAQ", "INSTITUTIONAL_FAQ"].includes(semanticIntent);
    const isComplaint = semanticIntent === "COMPLAINT_RECOVERY";
    const isHumanRequest = semanticIntent === "HUMAN_HANDOFF";

    if (currentStep === 'start' || currentStep === 'explicacao_agente') {
        if (isAffirmative) {
            nextStep = 'verificacao_cnpj';
            transitionApplied = true;
        }
    } else if (currentStep === 'verificacao_cnpj') {
        if (isAffirmative) {
            nextStep = 'consentimento_optin';
            transitionApplied = true;
        } else if (semanticIntent === "CNPJ_BLOCKED") {
            nextStep = 'coleta_cnpj_correto';
            transitionApplied = true;
        }
    } else if (currentStep === 'consentimento_optin') {
        if (semanticIntent === "OPTIN_ACCEPTED") {
            nextStep = 'criar_lead';
            transitionApplied = true;
        }
    } else if (currentStep === 'apresenta_ofertas') {
        if (requested_installments && requested_amount && !isDoubt) {
            nextStep = 'solicitar_simulacao';
            transitionApplied = true;
        }
    }

    // 3. MODO DE RESPOSTA
    let mode = "consultive";
    if (transitionApplied && !isDoubt) mode = "parrot";
    if (isHumanRequest || isComplaint) mode = "parrot";

    // 4. RETORNO LIMPO E EFICIENTE
    return {
        currentStep: nextStep,
        mode: mode,
        lead_info: {
            cnpj: leadInfo.cnpj,
            phone: rpcData.payload?.phone || leadInfo.phone,
            name: leadInfo.name,
            requested_amount: requested_amount,
            requested_installments: requested_installments
        },
        semanticIntent: semanticIntent
    };

} catch (error) {
    return { error: error.message };
}
```
