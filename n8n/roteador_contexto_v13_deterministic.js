/* 🧭 ROTEADOR DE CONTEXTO - V17.2 - CONVERSA LIVRE E SEGURA
   - Ajuste: Inclusão do FAQ DETALHADO e correção da saudação inicial.
   - Fix: Prioridade do Modo Parrot em botões e estados iniciais.
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
    ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || m.role || m.sender || m.direction).toLowerCase())
);

const lastSofiaMsg = String(assistantMessages[assistantMessages.length - 1]?.content || assistantMessages[assistantMessages.length - 1]?.text || "").toLowerCase().replace(/\*/g, '');
const historyTexts = history.map(m => String(m.content || m.text || "").toLowerCase().replace(/\*/g, '')).join(" ");

const linkAlreadySent = historyTexts.includes("clicar no link abaixo") || historyTexts.includes("fiservcapital.moneymoneyinvest");

let currentStep = 'start';
if (linkAlreadySent) {
    currentStep = 'envio_link';
} else if (lastSofiaMsg.includes("responsavel pelo cnpj") || lastSofiaMsg.includes("responsável pelo cnpj") || lastSofiaMsg.includes("confirmar uma informação")) {
    currentStep = 'verificacao_cnpj';
} else if (lastSofiaMsg.includes("sou a sofia") || lastSofiaMsg.includes("especialista da ticket") || lastSofiaMsg.includes("reforço de caixa") || lastSofiaMsg.includes("enviar o link")) {
    currentStep = 'explicacao_agente';
}

// --- 2) INTENÇÕES ---
const isAgentButtonClick = /^falar com um agente!?$/i.test(lastUserLower);

// isAffirmative: APENAS concordâncias diretas que indicam avanço no link/simulação.
const isAffirmative = /^(sim|pode mandar|quero o link|manda o link|bora|aceito|é ele|sou eu|isso|correto|confirmo|quero sim|pode ser|com certeza|ok|beleza|manda|envia|mande)$/i.test(lastUserLower);

// isNegative: Recusas claras ou pedidos de parada.
const isNegative = /\b(não|nao|negativo|parar|cancelar|não quero|nem pensar|jamais|agora não|agora nao|deixa pra depois)\b/i.test(lastUserLower);

// isDoubt: Qualquer pergunta ou palavra de dúvida.
const isDoubt = /\b(dúvida|duvida|como funciona|saber mais|explica|entender|oque é|o que é|golpe|seguro|fraude|confiável|taxa|juros|bmp|banco|garantia|prazo|boleto|falar com um agente|porque|objetivo|garantias)\b/i.test(lastUserLower);

const isHumanRequest = /\b(pessoa|humano|atendente|vendedor|alguém|atendimento humano|falar com um humano|agente humano)\b/i.test(lastUserLower);
const isGreeting = /^(oi|ol[aá]|bom dia|boa tarde|boa noite|oie|opa)$/i.test(lastUserLower);

// --- 3) TRANSIÇÕES DE ESTADO ---
let nextStep = currentStep;
let transitionApplied = false;

// 🛡️ REGRAS DE TRANSIÇÃO RÍGIDAS
if (isAgentButtonClick) {
    nextStep = 'explicacao_agente';
    transitionApplied = true;
} 
else if (currentStep === 'start') {
    if (!isNegative && !isDoubt) { 
        nextStep = 'explicacao_agente'; 
        transitionApplied = true; 
    }
} 
else if (currentStep === 'explicacao_agente') {
    if (isAffirmative && !isDoubt) { 
        nextStep = 'verificacao_cnpj'; 
        transitionApplied = true; 
    }
} 
else if (currentStep === 'verificacao_cnpj') {
    if (isAffirmative && !isDoubt) {
        nextStep = 'envio_link'; 
        transitionApplied = true;
    }
}

// --- 4) MODO DE RESPOSTA ---
let mode = "consultive";

if (transitionApplied && (!isDoubt || isAgentButtonClick)) {
    mode = "parrot";
}

if ((isDoubt || isHumanRequest || currentStep === 'envio_link') && !isAgentButtonClick) {
    mode = "consultive";
}

// --- 5) PROMPT FINAL ---
let activeConfig = blueprint.steps[nextStep] || blueprint.steps["start"];
if (isAgentButtonClick) activeConfig = blueprint.steps["explicacao_agente"];

let forcedText = String(activeConfig.rules || "");

// --- OVERRIDE DE TEXTOS FIXOS (GARANTE A MENSAGEM OFICIAL) ---
if (currentStep === 'start') {
    forcedText = `Já pensou em reforçar o caixa sem burocracia?
 
Você pode ter até *R$ 500 mil* disponíveis, usando apenas seus recebíveis Ticket como garantia. A consulta é rápida e sem compromisso.

✅ Taxas a partir de *1,89% a.m*;
✅ Crédito disponível entre *10 mil a 500 mil reais*;
✅ Recebimento do dinheiro em até *24h*;

👉 Posso enviar o link para simular o valor disponível para o seu CNPJ ou ficou com alguma dúvida?`;
}
else if (isAgentButtonClick || nextStep === 'explicacao_agente') {
    forcedText = `Olá! Sou a Sofia, especialista da Ticket. Que bom que você quer saber mais!

Explicando rapidamente: este é um reforço de caixa exclusivo para parceiros Ticket. Você pode ter de *R$ 10 mil a R$ 500 mil* com taxas a partir de *1,89% a.m*. O dinheiro cai na sua conta em até *24h* e o pagamento é feito via boleto bancário, sem comprometer seu limite de crédito.

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
Você é Sofia, consultora virtual da Ticket Edenred. Sua missão é conversar, esclarecer dúvidas e ganhar a confiança do cliente antes de enviar o link de simulação de crédito.
</identity>

<DIRETRIZES_ANTI_REPETICAO>
- NÃO repita a mesma saudação ou explicação se o usuário já a recebeu.
- Varie as palavras. Se o usuário perguntar "como funciona" logo após você ter explicado, aprofunde em um detalhe novo ou use sinônimos.
- Se o usuário disse "sim" para o link, não explique o produto novamente, apenas siga para a confirmação.
</DIRETRIZES_ANTI_REPETICAO>

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

Meu domicilio ficará na BMP após pagamento do empréstimo ou posso alterar?
Após a quitação do empréstimo você poderá retornar para o seu domicilio de preferência, basta acessar o Portal do Estabelecimento e solicitar a alteração.

Eu não posso alterar meu domicilio durante esse tempo?
Infelizmente não, durante o período em que o empréstimo estiver ativo, seu domicílio bancário com a Ticket fica vinculado à conta do banco BMP, como parte da garantia da operação. Depois que todas as parcelas forem quitadas, você poderá alterar seu domicílio bancário normalmente pelo Portal do Estabelecimento.

Prefiro realizar antecipações de recebíveis
Entendi, mas o crédito Fiserv não inviabiliza a contratação de antecipações, e funciona como um complemento das antecipações possibilitando que você tenha mais investimento para a expansão do seu negócio, pagar custos adicionais, antecipar fornecedores, aumentar fluxo de caixa, etc. Além disso, é apenas uma simulação sem compromisso, você pode avaliar se o empréstimo possui condições vantajosas pra você.

Como posso validar se não é golpe?
Você pode validar através do Portal Ticket onde temos banners sobre a parceria, ou entrar em contato com a nossa Central de Atendimento através do número 4004-2233, e questionar sobre a oferta de crédito para a pessoa que realizar o seu atendimento!

Posso antecipar as parcelas ou quitar meu empréstimo?
Sim, é possível. Você pode antecipar tanto parcelas que estão próximas, quanto também as últimas. Basta entrar em contato com a Fiserv pelo WhatsApp: (11) 4369-1799 

--- FAQ INSTITUCIONAL TICKET ---
Portal do Estabelecimento: portalestabelecimento.ticket.com.br.
Dados Bancários: Alteração via Portal > Minha Conta. Requer validação facial do sócio em até 72h.
Taxas: Consulta via Portal > Produtos e taxas.
Reembolso: Prazo de 7 ou 30 dias. Antecipação via Portal (Eventual ou Automática).
Atendimento: 4004-2233.
</BASE_DE_CONHECIMENTO_FAQ>

<DIRETRIZES_DE_RESPOSTA>
1. Se houver dúvida, responda a dúvida primeiro usando a BASE_DE_CONHECIMENTO_FAQ. Use as respostas EXATAS do FAQ sempre que possível.
2. FORMATAÇÃO: Use sempre um espaço de uma linha (pular linha) entre parágrafos.
3. DESTAQUE: Use negrito (ex: *texto*) para destacar dados importantes como valores, prazos, links e números de telefone.
4. CTA (CHAMADA PARA AÇÃO):
   - Se o link NÃO foi enviado (linkAlreadySent = false): Termine sempre com: "👉 Posso te enviar o link para você simular agora ou prefere tirar mais alguma dúvida?"
   - Se o link JÁ foi enviado (linkAlreadySent = true): Termine sempre com: "Você ainda tem alguma dúvida ou posso te ajudar com algo mais?"
5. Seja empático e profissional. Não ignore o contexto da pergunta do cliente.
</DIRETRIZES_DE_RESPOSTA>

<CONTEXTO_ATUAL>
- Passo: ${nextStep}
- Link Enviado: ${linkAlreadySent}
</CONTEXTO_ATUAL>`;
}

return {
  final_system_prompt: finalPrompt,
  p_conversation_id: rpcData.conversation?.id || rpcData.p_conversation_id,
  currentStep: nextStep,
  mode: mode,
  debug: { 
    currentStep, 
    nextStep, 
    isDoubt,
    isAffirmative,
    isNegative,
    mode
  }
};
