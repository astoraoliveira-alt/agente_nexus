/* 🧭 ROTEADOR DE CONTEXTO - V17.29 - SELF-SIMULATION FIX
   - Fix: Detecção de pedido para Sofia simular ("vc nao poderia simular pra mim?")
   - Antes: isLinkRequest disparava parrot com intro pitch errado.
   - Agora: isSelfSimulationRequest força mode=consultive → LLM usa <instrucao_de_manejo_de_dúvida>.
*/

const rpcData = $node["RPC - Acesso Entrada"].json;
const ctx = rpcData.context || {};

// 🛡️ PROTEÇÃO DE HANDOFF (HITL)
if (ctx.status === 'human_active') {
    return {
        stop_flow: true,
        reason: "Handoff Ativo: Operador humano está no controle.",
        conversation_id: rpcData.conversation?.id || rpcData.p_conversation_id
    };
}

const leadInfo = ctx.lead_info || {};
const agent = ctx.agent || {};
const blueprint = agent.workflow_blueprint || { steps: {} };
const history = ctx.messages_history || [];

const currentMsg = String($json?.content ?? $json?.text ?? $json?.message ?? $json?.body ?? rpcData?.message ?? ctx?.current_message ?? "").trim();
const lastUserLower = currentMsg.toLowerCase();

// --- 1) HISTÓRICO E DETECÇÃO DE ESTADO ---
const assistantMessages = history.filter(m =>
    ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || m.role || m.sender || m.direction).toLowerCase())
);

const lastSofiaMsg = String(assistantMessages[assistantMessages.length - 1]?.content || assistantMessages[assistantMessages.length - 1]?.text || "").toLowerCase().replace(/\*/g, '');
const historyTexts = history.map(m => String(m.content || m.text || "").toLowerCase().replace(/\*/g, '')).join(" ");

const linkAlreadySent = historyTexts.includes("clicar no link abaixo") || historyTexts.includes("fiservcapital.moneymoneyinvest");

let currentStep = 'start';
if (linkAlreadySent) {
    currentStep = 'envio_link';
} else if (lastSofiaMsg.includes("cnpj") && (lastSofiaMsg.includes("responsavel") || lastSofiaMsg.includes("responsável") || lastSofiaMsg.includes("empresa") || lastSofiaMsg.includes("confirmar") || lastSofiaMsg.includes("informacao") || lastSofiaMsg.includes("informação"))) {
    currentStep = 'verificacao_cnpj';
} else if (lastSofiaMsg.includes("sou a sofia") || lastSofiaMsg.includes("especialista da ticket") || lastSofiaMsg.includes("reforço") || lastSofiaMsg.includes("reforco") || lastSofiaMsg.includes("caixa") || lastSofiaMsg.includes("enviar o link")) {
    currentStep = 'explicacao_agente';
} else if (assistantMessages.length > 0) {
    currentStep = 'explicacao_agente';
}

// --- 2) INTENÇÕES ---
const isAgentButtonClick = /^falar com um agente!?$/i.test(lastUserLower);

// ← AJUSTE 1: Detecta quando o cliente pede que A SOFIA simule (não pede o link)
const isSelfSimulationRequest =
    /\b(simular?|simula[çc][ãa]o)\b/i.test(lastUserLower) &&
    /\b(vc|voc[eê]|tu|pra mim|por mim|aqui|me faz|poderia|consegue|conseguiria|faz(er)?)\b/i.test(lastUserLower);

// ← AJUSTE 2: isLinkRequest exclui isSelfSimulationRequest para não disparar parrot errado
const isLinkRequest = !isSelfSimulationRequest && (
    /\b(simular|simula[çc][ãa]o)\b/i.test(lastUserLower) ||
    (/\b(quero|manda|mande|envia|passa|passe|pode|me d[áa]|mandar)\b/i.test(lastUserLower) && /\b(link|simul|proposta|an[áa]lise)\b/i.test(lastUserLower)) ||
    (/^link$/i.test(lastUserLower))
);

const isAffirmative = (/\b(s[ií]+m+|pode|manda|mande|envia|bora|aceito|ok|beleza|correto|confirm[ao]|show|com certeza|isso|exato|exatamente|claro|positivo|verdade|de acordo|fechou)\b/i.test(lastUserLower) || isLinkRequest) && !/\b(n[ãa]o|como|como assim)\b/i.test(lastUserLower);
const isNegative = /\b(não|nao|negativo|parar|cancelar|não quero|nem pensar|jamais|agora não|agora nao|deixa pra depois)\b/i.test(lastUserLower);
const isDoubt = /\b(dúvida|duvida|como|como assim|como funciona|saber mais|explica|entender|oque é|o que é|golpe|seguro|fraude|confiável|taxa|juros|bmp|banco|garantia|prazo|boleto|falar com um agente|porque|objetivo|garantias|quem é você|quem e voce|você é bot|voce e bot|é um robô|e um robo)\b/i.test(lastUserLower);
const isHumanRequest = /\b(atendimento|falar com|conversar com|passar para|chamar|quero|preciso)\b.*\b(humano|pessoa|atendente|vendedor|algu[ée]m|especialista|assessor|fone|telefone|ligar|ligação)\b/i.test(lastUserLower) || /^(atendente|assessor|humano|pessoa|fone|telefone)$/i.test(lastUserLower);
const isFarewell = /\b(obrigado|obrigada|vlw|valeu|entendido|entendi|tchau|at[ée] logo|por enquanto [ée] s[óo]|nada mais|encerrar|show)\b/i.test(lastUserLower);
const isGreeting = /^(oi|ol[aá]|bom dia|boa tarde|boa noite|oie|opa)$/i.test(lastUserLower);
const isComplaint = /\b(atraso|problema|errado|não recebi|nao recebi|reclamação|ruim|péssimo|horrível|cancelar|lixo|merda|falha|está ruim|está péssimo)\b/i.test(lastUserLower);

// --- 3) GESTÃO DINÂMICA DE INCIDENTES (Smart Match V2) ---
let forcedIncidentText = null;
const activeIncidents = agent.active_incidents || [];
const incidentIdFromPayload = rpcData.payload?.incident_id;
let isLinkIssue = false;

const currentCampaignId = rpcData.p_metadata?.campaign_id || leadInfo.campaign_id || ctx.campaign_id;

// Prioridade 1: Broadcast Ativo (ID vindo do payload)
if (incidentIdFromPayload) {
    const specificIncident = activeIncidents.find(i => i.id === incidentIdFromPayload);
    if (specificIncident) {
        forcedIncidentText = specificIncident.response_message;
        isLinkIssue = true;
    }
}

// Prioridade 2: Smart Match Passivo (se não foi forçado pelo payload)
if (!forcedIncidentText) {
    for (const incident of activeIncidents) {
        if (incident.mode === 'passive' || incident.mode === 'both') {
            if (incident.campaign_id && incident.campaign_id !== currentCampaignId) continue;

            const triggerWords = incident.problem_description.toLowerCase()
                .split(/[\s,.\/]/)
                .filter(w => w.length > 3);

            const matched = triggerWords.some(w => lastUserLower.includes(w));

            if (matched) {
                isLinkIssue = true;
                forcedIncidentText = incident.response_message;
                if (incident.campaign_id === currentCampaignId) break;
            }
        }
    }
}

const lastAssistantMsg = String(assistantMessages[assistantMessages.length - 1]?.content || "").toLowerCase();
const humanAlreadyRequested = lastAssistantMsg.includes("assessor entre em contato") || lastAssistantMsg.includes("aguardar o retorno de um especialista");

// --- 4) TRANSIÇÕES DE ESTADO ---
let nextStep = currentStep;
let transitionApplied = false;

if (isAgentButtonClick) {
    nextStep = 'explicacao_agente';
    transitionApplied = true;
} else if (currentStep === 'start') {
    if (!isNegative && !isDoubt) {
        nextStep = 'explicacao_agente';
        transitionApplied = true;
    }
} else if (currentStep === 'explicacao_agente') {
    if (isAffirmative && !isDoubt) {
        nextStep = 'verificacao_cnpj';
        transitionApplied = true;
    }
} else if (currentStep === 'verificacao_cnpj') {
    if (isAffirmative && !isDoubt) {
        nextStep = 'envio_link';
        transitionApplied = true;
    }
}

// --- 5) MODO DE RESPOSTA ---
let mode = "consultive";
// Prioridade Parrot: Transição, Botão, Humano, Incidente OU Reclamação
if ((transitionApplied && !isDoubt) || isAgentButtonClick || isHumanRequest || isLinkIssue || isComplaint) {
    mode = "parrot";
}
if (isLinkRequest && !isDoubt) {
    mode = "parrot";
}
if ((isDoubt || isFarewell || currentStep === 'envio_link') && !isAgentButtonClick && !isHumanRequest && !isLinkIssue) {
    mode = "consultive";
}
// ← AJUSTE 3: Quando cliente quer que Sofia simule, deixa o LLM explicar por que não pode
if (isSelfSimulationRequest) {
    mode = "consultive";
}

// --- 6) PROMPT FINAL ---
let activeConfig = blueprint.steps[nextStep] || blueprint.steps["start"];
if (isAgentButtonClick) activeConfig = blueprint.steps["explicacao_agente"];

let forcedText = String(activeConfig.rules || "");

// --- OVERRIDE DE TEXTOS FIXOS (PRIORIDADE) ---

// PRIORIDADE 1: Incidentes Ativos (Dinamismo Total)
if (isLinkIssue && forcedIncidentText) {
    forcedText = forcedIncidentText;
}
// PRIORIDADE 2: Pedido de Atendente/Humano
else if (isHumanRequest) {
    const isPhone = /\b(fone|telefone|ligar|ligação)\b/i.test(lastUserLower);
    if (isPhone) {
        forcedText = `Certo, ${leadInfo.name || "parceiro"}! Para um atendimento mais detalhado e personalizado pelo telefone, recomendo que entre em contato diretamente com a nossa Central de Atendimento através do número *4004-2233*. 

Eles estarão prontos para ajudar com todas as suas dúvidas sobre o reforço de caixa! 📞`;
    } else {
        forcedText = `Claro, entendo.

Vou solicitar para que um assessor entre em contato com você pelo WhatsApp em até 2 dias úteis e siga com o seu atendimento.

Enquanto isso, se quiser tirar alguma dúvida pontual por aqui, estou à disposição.`;
    }
}
// PRIORIDADE 3: Reclamações (Escuta Ativa)
else if (isComplaint) {
    forcedText = `Certo, entendo perfeitamente sua frustração. Sinto muito que sua experiênca atual esteja sendo assim. 

Como você mencionou esse problema, vou priorizar o seu contato com um de nossos consultores humanos para que ele verifique isso detalhadamente antes de qualquer outra coisa. 

Você gostaria de falar sobre mais algum ponto específico antes do nosso especialista entrar em contato?`;
}
// PRIORIDADE 4: Boas-vindas (Start)
else if (currentStep === 'start' && assistantMessages.length < 2 && !isAgentButtonClick) {
    forcedText = `Já pensou em reforçar o caixa sem burocracia?
 
Você pode ter até *R$ 500 mil* disponíveis, usando apenas seus recebíveis Ticket como garantia. A consulta é rápida e sem compromisso.

✅ Taxas a partir de *1,89% a.m*;
✅ Crédito disponível entre *10 mil a 500 mil reais*;
✅ Recebimento do dinheiro em até *24h*;

👉 Posso enviar o link para simular o valor disponível para o seu CNPJ ou ficou com alguma dúvida?`;
}
// PRIORIDADE 5: Explicação Sofia
else if (isAgentButtonClick || nextStep === 'explicacao_agente') {
    forcedText = `Olá! Sou a Sofia, especialista da *Ticket*. Que bom que você quer saber mais!

Explicando rapidamente: este é um reforço de caixa exclusivo para parceiros Ticket. Você pode ter de *R$ 10 mil a R$ 500 mil* com taxas a partir de *1,89% a.m.* O dinheiro cai na sua conta em até *24h* e o pagamento é feito via boleto bancário, sem comprometer seu limite de crédito.

👉 Posso te enviar o link seguro para você simular o valor exato agora ou prefere tirar alguma dúvida antes? 📈`;
}

forcedText = forcedText
    .replace(/{{lead_info\.cnpj}}/g, `*${leadInfo.cnpj || "não informado"}*`)
    .replace(/{{lead_info\.name}}/g, `*${leadInfo.name || "não informado"}*`)
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
--- FAQ PRODUTO (OFERTA DE CRÉDITO) ---

Como funciona o empréstimo?
Vamos lá. Vou te explicar melhor. 
Você pode optar por dar como garantia apenas o seu recebível Ticket ou sua agenda total de recebíveis (débito, crédito e voucher Ticket). Nessa opção de agenda total, você pode conseguir um valor pré-aprovado de empréstimo até 2x maior! 
1. O pagamento das parcelas será feito via Boleto Bancário e seus recebíveis serão utilizados apenas em caso de não efetivação do pagamento via boleto. Para isso, iremos travar o seu domicílio bancário em uma nova conta no banco BMP.
2. A Fiserv irá analisar suas informações e em menos de 24h um especialista deles entrará em contato pelo WhatsApp para informar se há valor disponível e dar andamento na sua solicitação. 
Para saber se você possui algum crédito disponível, é necessário que você faça a solicitação de análise de crédito pelo site da Fiserv e aguarde a devolutiva pelo WhatsApp verificado da Fiserv. Deseja simular? É sem compromisso.

O que seria essa nova conta BMP?
Para que os seus recebíveis Ticket possam ser utilizados como garantia, faremos a alteração do seu domicílio bancário cadastrado com a Ticket para uma nova conta do banco BMP vinculada a uma trava bancária, que ficará ativa até a quitação total do empréstimo. Os recebíveis Ticket passarão a ser depositados nessa nova conta e serão repassados para a uma conta de preferência que você informará no momento da contratação do empréstimo. Só haverá a retenção do seu recebível Ticket em caso de não pagamento do boleto bancário.

O que é Trava Bancária?
A trava de domicílio é o que nos permite usar seus recebíveis Ticket como garantia do pagamento, sua vendas futuras são bloqueadas e direcionadas automaticamente para o banco BMP para pagamento da dívida, caso o boleto não seja pago. Nesse caso, você não poderá usar esses recebíveis Ticket em outros lugares até a quitação.

Não quero usar meu recebível como pagamento
Infelizmente é necessário que haja alguma garantia para o fornecimento do crédito. O desconto da parcela só será feito através do seu recebível Ticket se não houver o pagamento do boleto, ou seja, você receberá suas vendas normalmente, não se preocupe.

Em quantas vezes posso parcelar?
O pagamento poderá ser feito em até 24 parcelas via Boleto Bancário.

Em quanto tempo eu recebo um retorno sobre a análise de crédito?
Em até 24h você receberá um retorno pelo próprio whatsapp da Fiserv com uma resposta sobre a análise de valores disponíveis para o seu CNPJ. Caso possua valores, um especialista irá lhe passar todos os detalhes sobre as condições e prazos de pagamento.

Qual é a Taxa de juros?
Cada cliente tem uma proposta personalizada para o seu perfil, sendo assim não temos uma taxa fixa. Trabalhamos com taxas entre 1,89% a.m. a 3,28% a.m e prazo de pagamento de até 24 meses, você precisará realizar a simulação para verificar a taxa e prazo disponibilizado para você!

Valores de empréstimo:
Para saber o valor de empréstimo seu CNPJ precisará passar por uma rápida análise de crédito, em que pode ser liberado valores entre R$10.000 à R$500.000.

O que é BMP?
BMP Sociedade de Crédito Direto S/A é uma instituição financeira aprovada pelo Banco Central do Brasil parceira da Ticket e Fiserv Capital. Ela oferece soluções bancárias integradas, como contas digitais e pagamentos, permitindo que empresas usem essas funcionalidades sem precisar criar toda a estrutura do zero.

O que significa usar os recebíveis como garantia?
Significa que a Fiserv Capital utilizará os seus recebimentos Ticket como garantia, assim você não precisa comprometer seus bens como imóvel ou carro para garantia de pagamento da dívida. 

Com quanto tempo de atraso no pagamento via boleto acarretará em desconto via recebíveis Ticket?
Se o estabelecimento ficar entre 3 a 4 meses sem realizar os devidos pagamentos via boleto bancário, a Fiserv fará o desconto via recebível Ticket. Após a quitação dos boletos em atraso, o pagamento voltará a ser feito via boleto.

O valor que eu solicitar será o valor que será aprovado para mim?
Não necessariamente. O valor desejado é uma base, mas após você informá-lo, faremos uma análise de crédito para avaliar seus dados e definir o limite final, que pode ser menor ou maior que o solicitado. Mas não se preocupe, faremos o possível para ao menos alcançar o valor desejado.

Posso aumentar meu limite aprovado? Como consigo uma oferta de crédito?
Sabemos que o Empréstimo Ticket pode ser um grande apoio para o crescimento do seu negócio, mas não podemos garantir uma oferta, pois ela depende dos critérios de análise. Você pode aumentar suas chances mantendo suas informações sempre atualizadas. Nosso time usa seus dados para fazer a análise de crédito, então quanto mais soubermos sobre o seu negócio, maiores as chances de aprovação.

Qual a data final da trava de domicílio?
Quando for finalizado o pagamento das parcelas, iremos informá-lo para que realize a alteração bancária para uma conta que deseja voltar a receber os recebíveis Ticket.

Meu domicilio ficará na BMP após pagamento do empréstimo ou posso alterar?
Após a quitação do empréstimo você poderá retornar para o seu domicilio de preferência, basta acessar o Portal do Estabelecimento e solicitar a alteração.

Eu não posso alterar meu domicilio durante esse tempo?
Infelizmente não, durante o período em que o empréstimo estiver ativo, seu domicílio bancário com a Ticket fica vinculado à conta do banco BMP, como parte da garantia da operação. Essa alteração é temporária e serve apenas para permitir que os recebíveis Ticket passsem por essa conta antes de serem repassados para a conta que você escolher no momento da contratação. Depois que todas as parcelas forem quitadas, você poderá alterar seu domicílio bancário normalmente pelo Portal do Estabelecimento.

Prefiro realizar antecipações de recebíveis
Entendi, mas o crédito Fiserv não inviabiliza a contratação de antecipações, e funciona como um complemento das antecipações possibilitando que você tenha mais investimento para a expansão do seu negócio, pagar custos adicionais, antecipar fornecedores, aumentar fluxo de caixa, etc. Além disso, é apenas uma simulação sem compromisso, você pode avaliar se o empréstimo possui condições vantajosas pra você.

Não quero pagar via boleto, tem outro método?
Esse é o método de pagamento que utilizamos atualmente, mas em breve teremos a possibilidade do desconto automático diário das vendas (TPV). Você pode pagar as primeiras parcelas nesse formato e posteriormente migrar para esse novo formato.

Tenho taxas melhores em outros bancos/empresas, não tenho interesse.
A nossa taxa é uma das melhores do mercado no momento, como falei, não é uma taxa fixa, ela é personalizável para cada cliente, o que ajuda a ter condições melhores. Você pode solicitar a análise apenas para conhecer as condições disponíveis para o seu CNPJ e assim comparar o melhor custo benefício.

Como posso validar se não é golpe?
Você pode validar através do Portal Ticket onde temos banners sobre a parceria, ou entrar em contato com a nossa Central de Atendimento através do número 4004-2233, e questionar sobre a oferta de crédito para a pessoa que realizar o seu atendimento!

--- FAQ INSTITUCIONAL TICKET ---
Portal do Estabelecimento: portalestabelecimento.ticket.com.br.
Dados Bancários: Alteração via Portal > Minha Conta. Requer validação facial do sócio em até 72h.
Taxas: Consulta via Portal > Produtos e taxas.
Reembolso: Prazo de 7 ou 30 dias. Antecipação via Portal (Eventual ou Automática).
Atendimento: 4004-2233.
</BASE_DE_CONHECIMENTO_FAQ>

<REGRA_CTA_OBRIGATORIA>
${isFarewell
            ? "O usuário está agradecendo ou encerrando a conversa. Seja muito gentil, deseje sucesso e encerre com 'Qualquer coisa, estou à disposição!' ou 'Precisando, é só chamar!'. NÃO faça novas perguntas ou convites de simulação."
            : linkAlreadySent
                ? `O link de simulação JÁ foi enviado. Você deve OBRIGATORIAMENTE terminar sua resposta pulando uma linha e fazendo a seguinte pergunta: "*Você ainda tem alguma dúvida ou posso te ajudar com algo mais?*"`
                : (isHumanRequest || isComplaint || humanAlreadyRequested)
                    ? ""
                    : `O link de simulação AINDA NÃO foi enviado. Você deve OBRIGATORIAMENTE terminar sua resposta pulando uma linha e fazendo a seguinte pergunta: "👉 Posso te enviar o link para você simular agora ou prefere tirar mais alguma dúvida?"`
        }
</REGRA_CTA_OBRIGATORIA>

<instrucao_de_manejo_de_dúvida>
Se o cliente insistir em simular com você (Ex: "quero fazer aqui"):
- Explique: "*${leadInfo.name || "parceiro"}, eu adoraria fazer por aqui, mas como a análise da Fiserv consulta seus recebíveis em tempo real para te dar a melhor taxa, ela precisa ser feita no ambiente seguro do site oficial. É super rápido e protege seus dados!*"
</instrucao_de_manejo_de_dúvida>

<tom_de_voz>
- COMEÇO NATURAL: Comece as respostas de forma simples: "Certo", "Entendi", "Perfeito" ou "Vamos lá", sempre seguido do nome do cliente. 
- PROIBIDO: Iniciar com frases robóticas ou clichês de IA como "Entendo sua dúvida" ou "Entendo sua preocupação". Seja direta e humana.
- DETALHAMENTO NECESSÁRIO: Responda com o nível de detalhe necessário para sanar a dúvida, sem inventar informações. Priorize a precisão técnica do FAQ.
- EVITE REPETIÇÃO: Se o cliente insistir em um assunto ou fizer perguntas de acompanhamento, evite repetir a mesma resposta anterior palavra por palavra. Varie a explicação mantendo a precisão do FAQ. Verifique o histórico para não ser repetitiva.
- FOCO NO NEGÓCIO: Se o cliente fizer perguntas totalmente fora de contexto (clima, esportes, notícias), responda de forma gentil que você é uma especialista em crédito e não possui essa informação, convidando-o a tirar dúvidas sobre o reforço de caixa.
</tom_de_voz>

<empatia_e_personalizacao>
- EMOJI POR SEGMENTO: Analise o nome da empresa (${leadInfo.name}). Se identificar o tipo de negócio (Ex: Padaria, Farmácia, Restaurante, Oficina), use UM emoji relacionado em momentos oportunos da conversa para gerar empatia. 
- NATURALIDADE: Não use o emoji em todas as mensagens para não ficar cansativo. Use apenas quando fizer sentido no contexto da explicação ou na saudação/despedida.
- EXEMPLOS DE MAPEAMENTO: Padaria 🍞, Farmácia 💊, Restaurante 🍽️, Oficina/Auto 🚗, Mercado 🛒, Consultoria/Serviços 💼, Café ☕, Açougue 🥩.
</empatia_e_personalizacao>

<regra_de_ouro>
NUNCA invente taxas ou condições. Se a dúvida for sobre o funcionamento técnico, use APENAS os textos da BASE_DE_CONHECIMENTO_FAQ acima.
</regra_de_ouro>

<CONTEXTO_ATUAL>
- Passo: ${nextStep}
- Link Enviado: ${linkAlreadySent}
- Nome da Empresa: ${leadInfo.name}
- Encerramento Detectado: ${isFarewell}
</CONTEXTO_ATUAL>`;
}

return {
    final_system_prompt: finalPrompt,
    p_conversation_id: rpcData.conversation?.id || rpcData.p_conversation_id,
    currentStep: nextStep,
    mode: mode,
    trigger_handoff: (isHumanRequest || isComplaint) && !isAgentButtonClick,
    handoff_data: {
        initial_message: currentMsg,
        campaign_id: leadInfo.campaign_id || ctx.campaign_id,
        lead_id: leadInfo.id || ctx.lead_id,
        tenant_id: ctx.tenant_id,
        priority: isComplaint ? 'high' : 'medium'
    },
    debug: { nextStep, mode, isLinkIssue, isSelfSimulationRequest, currentCampaignId }
};
