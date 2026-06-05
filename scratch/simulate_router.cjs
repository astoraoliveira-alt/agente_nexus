const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function run() {
  const convId = '098f0415-da15-4f1c-b617-8811cb4897d0';
  
  // Fetch conversation, messages, agent
  const { data: conv } = await supabase.from('conversations').select('*').eq('id', convId).single();
  const { data: agent } = await supabase.from('agents').select('*').eq('id', conv.agent_id).single();
  const { data: messages } = await supabase.from('messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: true });
  
  // In the real execution, when the user sent "Falar com um agente!", the messages_history had the messages BEFORE the user's message, plus the user's message is the currentMsg.
  // Let's reconstruct the history and currentMsg at the time of processing "Falar com um agente!".
  // Messages in DB:
  // 0: outbound reengagement
  // 1: outbound conversion system msg
  // 2: inbound user "Falar com um agente!"
  // 3: outbound AI response
  
  const history = [
    { sender_type: 'agent', content: messages[0].content },
    { sender_type: 'system', content: messages[1].content }
  ];
  
  const currentMsg = messages[2].content;
  const lastUserLower = currentMsg.toLowerCase().trim();
  
  console.log('lastUserLower:', JSON.stringify(lastUserLower));
  
  // Let's simulate the JS code running in the n8n context router.
  const leadInfo = { is_lead: true, name: conv.user_name }; // Let's mock leadInfo
  const ctx = { messages_history: history };
  const blueprint = agent.workflow_blueprint || { steps: {} };
  
  // Let's evaluate the intents
  const assistantMessages = history.filter(m =>
    ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || m.role || m.sender || m.direction).toLowerCase())
  );
  
  const lastSofiaMsg = String(assistantMessages[assistantMessages.length - 1]?.content || "").toLowerCase().replace(/\*/g, '');
  const historyTexts = history.map(m => String(m.content || "").toLowerCase().replace(/\*/g, '')).join(" ");
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
  
  const isAgentButtonClick = /^falar com um agente!?$/i.test(lastUserLower);
  
  const isSelfSimulationRequest =
      /\b(simular?|simula[çc][ãa]o)\b/i.test(lastUserLower) &&
      /\b(vc|voc[eê]|tu|pra mim|por mim|aqui|me faz|poderia|consegue|conseguiria|faz(er)?)\b/i.test(lastUserLower);
      
  const semanticIntent = "HUMAN_HANDOFF"; // Let's test with the worst case
  
  const isLinkRequest = !isSelfSimulationRequest && (
      /\b(simular|simula[çc][ãa]o)\b/i.test(lastUserLower) ||
      (/\b(quero|manda|mande|envia|passa|passe|pode|me d[áa]|mandar)\b/i.test(lastUserLower) && /\b(link|simul|proposta|an[áa]lise)\b/i.test(lastUserLower)) ||
      (/^link$/i.test(lastUserLower)) ||
      semanticIntent === "SIMULATION_REQUEST"
  );
  
  const isAffirmative = (/\b(s[ií]+m+|pode|manda|mande|envia|bora|aceito|ok|beleza|correto|confirm[ao]|show|com certeza|isso|exato|exatamente|claro|positivo|verdade|de acordo|fechou)\b/i.test(lastUserLower) || isLinkRequest) && !/\b(n[ãa]o|como|como assim)\b/i.test(lastUserLower);
  const isNegative = /\b(não|nao|negativo|parar|cancelar|não quero|nem pensar|jamais|agora não|agora nao|deixa pra depois)\b/i.test(lastUserLower);
  
  const regexDoubt = /\b(dúvida|duvida|como|como assim|como funciona|saber mais|explica|entender|oque é|o que é|golpe|seguro|fraude|confiável|taxa|juros|bmp|banco|garantia|prazo|boleto|falar com um agente|porque|objetivo|garantias|quem é você|quem e voce|você é bot|voce e bot|é um robô|e um robo)\b/i.test(lastUserLower);
  const isDoubt = regexDoubt || semanticIntent === "DOUBT"; 
  
  const regexHuman = /\b(atendimento|falar com|conversar com|passar para|chamar|quero|preciso)\b.*\b(humano|persona|atendente|vendedor|algu[ée]m|especialista|assessor|fone|telefone|ligar|ligação)\b/i.test(lastUserLower) || /^(atendente|assessor|humano|persona|fone|telefone)$/i.test(lastUserLower);
  
  const isHumanRequest = (regexHuman || semanticIntent === "HUMAN_HANDOFF") && !isAgentButtonClick;
  
  const isFarewell = /\b(obrigado|obrigada|vlw|valeu|entendido|entendi|tchau|at[ée] logo|por enquanto [ée] s[óo]|nada mais|encerrar|show)\b/i.test(lastUserLower);
  const isGreeting = /^(oi|ol[aá]|bom dia|boa tarde|boa noite|oie|opa)$/i.test(lastUserLower);
  
  const regexComplaint = (/\b(atraso|problema|errado|reclamação|ruim|péssimo|horrível|lixo|merda|falha|funciona|está ruim|está péssimo)\b/i.test(lastUserLower) || (/\b(n[ãa]o recebi|nao recebi)\b/i.test(lastUserLower) && !/reembolso/i.test(lastUserLower)));
  const isComplaint = regexComplaint || semanticIntent === "COMPLAINT";
  
  let nextStep = currentStep;
  let transitionApplied = false;
  
  if (isAgentButtonClick) {
      nextStep = 'explicacao_agente';
      transitionApplied = true;
  }
  
  let mode = "consultive";
  if (leadInfo.is_lead === false || (transitionApplied && !isDoubt) || isAgentButtonClick || isHumanRequest || isLinkIssue_mocked() || isComplaint) {
      mode = "parrot";
  }
  if (isLinkRequest && !isDoubt) {
      mode = "parrot";
  }
  if ((isDoubt || isFarewell || currentStep === 'envio_link') && !isAgentButtonClick && !isHumanRequest && !isLinkIssue_mocked() && leadInfo.is_lead !== false) {
      mode = "consultive";
  }
  if (isSelfSimulationRequest && leadInfo.is_lead !== false) {
      mode = "consultive";
  }
  
  function isLinkIssue_mocked() { return false; }
  
  let activeConfig = blueprint.steps[nextStep] || blueprint.steps["start"];
  if (isAgentButtonClick) activeConfig = blueprint.steps["explicacao_agente"];
  
  let forcedText = String(activeConfig.rules || "");
  
  if (leadInfo.is_lead === false) {
      // ignore
  } else if (isAgentButtonClick) {
      forcedText = `Olá! Sou a Sofia, especialista da *Ticket*...`;
  }
  
  console.log('--- RESULTS ---');
  console.log('isAgentButtonClick:', isAgentButtonClick);
  console.log('isHumanRequest:', isHumanRequest);
  console.log('mode:', mode);
  console.log('forcedText:', forcedText);
  console.log('trigger_handoff:', (isHumanRequest || isComplaint) && !isAgentButtonClick);
}

run();
