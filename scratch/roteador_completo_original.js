/* 🧭 ROTEADOR DE CONTEXTO - JORNADA NATIVA FISERV V19 (FLUXO CORRIGIDO) */
/* MUDANÇAS V19: verificacao_cnpj → criar_lead diretamente (sem coleta_faturamento/coleta_valor) */

try {
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

    // --- 🛠️ FUNÇÕES AUXILIARES DE PARSING ---
    function parseNumber(text) {
        if (!text) return null;
        let clean = text.toLowerCase().trim();
        if (clean.includes('k')) {
            let val = parseFloat(clean.replace(/[^0-9,.]/g, '').replace(',', '.'));
            if (!isNaN(val)) return val * 1000;
        }
        if (clean.includes('mil')) {
            let val = parseFloat(clean.replace(/[^0-9,.]/g, '').replace(',', '.'));
            if (!isNaN(val)) return val * 1000;
        }
        if (clean.includes('.') && clean.includes(',')) {
            clean = clean.replace(/\./g, '').replace(',', '.');
        } else if (clean.includes(',')) {
            const parts = clean.split(',');
            if (parts.length === 2 && parts[1].length <= 2) {
                clean = parts[0].replace(/\./g, '') + '.' + parts[1];
            } else {
                clean = clean.replace(/,/g, '');
            }
        } else if (clean.includes('.')) {
            const parts = clean.split('.');
            if (parts.length === 2 && parts[1].length === 3) {
                clean = clean.replace(/\./g, '');
            }
        }
        clean = clean.replace(/[^0-9.]/g, '');
        let parsed = parseFloat(clean);
        return isNaN(parsed) ? null : parsed;
    }

    function findValueForQuestion(hist, questionSubstrings) {
        for (let i = 0; i < hist.length - 1; i++) {
            const msg = hist[i];
            const isBot = ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(msg.sender_type || msg.role || msg.sender || msg.direction).toLowerCase());
            if (isBot) {
                const content = String(msg.content || msg.text || "").toLowerCase();
                const matchesQuestion = questionSubstrings.some(sub => content.includes(sub));
                if (matchesQuestion) {
                    const nextMsg = hist[i + 1];
                    const nextIsBot = ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(nextMsg.sender_type || nextMsg.role || nextMsg.sender || nextMsg.direction).toLowerCase());
                    if (!nextIsBot) {
                        const parsed = parseNumber(nextMsg.content || nextMsg.text || "");
                        if (parsed !== null) return parsed;
                    }
                }
            }
        }
        return null;
    }

    // --- 0) LEITURA DO ROTEADOR SEMÂNTICO (LLM PRÉVIA) ---
    let semanticIntent = "OTHER";
    let semanticReasoning = "";

    try {
        const semanticData = $('Message a model1').first()?.json?.output?.[0]?.content?.[0]?.text;
        if (semanticData) {
            if (typeof semanticData === 'object' && semanticData !== null) {
                semanticIntent = semanticData.intent || "OTHER";
                semanticReasoning = semanticData.reasoning || "";
            } else if (typeof semanticData === 'string') {
                const trimmed = semanticData.trim();
                let parsed = null;
                if (trimmed.includes('{') && trimmed.includes('}')) {
                    try {
                        const startIdx = trimmed.indexOf('{');
                        const endIdx = trimmed.lastIndexOf('}');
                        const jsonStr = trimmed.substring(startIdx, endIdx + 1);
                        parsed = JSON.parse(jsonStr);
                    } catch (err) {
                        // Fallback parsing failed
                    }
                }
                
                if (parsed && typeof parsed === 'object') {
                    semanticIntent = parsed.intent || "OTHER";
                    semanticReasoning = parsed.reasoning || "";
                } else {
                    const upperStr = trimmed.toUpperCase();
                    if (upperStr.includes("HUMAN_HANDOFF")) {
                        semanticIntent = "HUMAN_HANDOFF";
                    } else if (upperStr.includes("COMPLAINT")) {
                        semanticIntent = "COMPLAINT";
                    } else if (upperStr.includes("DOUBT")) {
                        semanticIntent = "DOUBT";
                    } else if (upperStr.includes("SIMULATION_REQUEST")) {
                        semanticIntent = "SIMULATION_REQUEST";
                    } else if (["OTHER", "HUMAN_HANDOFF", "COMPLAINT", "DOUBT", "SIMULATION_REQUEST"].includes(upperStr)) {
                        semanticIntent = upperStr;
                    }
                }
            }
        }
    } catch (e) {
        // Falha silenciosa para não quebrar o fluxo caso o nó seja removido
    }

    // --- 1) HISTÓRICO E DETECÇÃO DE ESTADO ---
    const assistantMessages = history.filter(m =>
        ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || m.role || m.sender || m.direction).toLowerCase())
    );

    const lastSofiaMsg = String(assistantMessages[assistantMessages.length - 1]?.content || assistantMessages[assistantMessages.length - 1]?.text || "").toLowerCase().replace(/\*/g, '');
    const historyTexts = history.map(m => String(m.content || m.text || "").toLowerCase().replace(/\*/g, '')).join(" ");

    const linkAlreadySent = historyTexts.includes("clicar no link abaixo") || historyTexts.includes("fiservcapital.moneymoneyinvest");

    let currentStep = 'start';
    if (lastSofiaMsg.includes("confirmada com sucesso") || lastSofiaMsg.includes("assessores humanos")) {
        currentStep = 'finalizacao_sucesso';
    } else if (lastSofiaMsg.includes("não conseguimos liberar") || lastSofiaMsg.includes("oferta pré-aprovada de crédito")) {
        currentStep = 'recusa_analise';
    } else if (lastSofiaMsg.includes("enviei suas informações para a fiserv") || lastSofiaMsg.includes("análise e geração das ofertas") || lastSofiaMsg.includes("aguarde que eu já te chamo") || lastSofiaMsg.includes("gostaria de iniciar a simulação") || lastSofiaMsg.includes("comitê fiserv") || lastSofiaMsg.includes("avaliando") || lastSofiaMsg.includes("chamarás com o resultado") || lastSofiaMsg.includes("te chamará aqui com o resultado") || lastSofiaMsg.includes("aguarde um momento")) {
        currentStep = 'aguardando_fiserv';
    } else if (lastSofiaMsg.includes("confirma que deseja prosseguir")) {
        currentStep = 'confirmacao_cliente';
    } else if (lastSofiaMsg.includes("opções de crédito") || lastSofiaMsg.includes("quantidade de parcelas")) {
        currentStep = 'apresenta_ofertas';
    // V19: REMOVIDOS os blocos de detecção de 'coleta_valor' e 'coleta_faturamento'
    } else if (lastSofiaMsg.includes("autorização à fiserv") || lastSofiaMsg.includes("responda *sim*") || lastSofiaMsg.includes("responda *aceito*") || lastSofiaMsg.includes("responda *autorizo*") || lastSofiaMsg.includes("para autorizar e seguir")) {
        currentStep = 'consentimento_optin';
    } else if (lastSofiaMsg.includes("cnpj") && (lastSofiaMsg.includes("responsavel") || lastSofiaMsg.includes("responsável") || lastSofiaMsg.includes("empresa") || lastSofiaMsg.includes("confirmar") || lastSofiaMsg.includes("informacao") || lastSofiaMsg.includes("informação"))) {
        currentStep = 'verificacao_cnpj';
    } else if (lastSofiaMsg.includes("cnpj correto") || lastSofiaMsg.includes("solicitar a inclusão")) {
        currentStep = 'coleta_cnpj_correto';
    } else if (lastSofiaMsg.includes("nome do estabelecimento")) {
        currentStep = 'coleta_nome_estabelecimento';
    } else if (lastSofiaMsg.includes("sou a sofia") || lastSofiaMsg.includes("especialista da ticket") || lastSofiaMsg.includes("reforço") || lastSofiaMsg.includes("reforco") || lastSofiaMsg.includes("caixa") || lastSofiaMsg.includes("enviar o link")) {
        currentStep = 'explicacao_agente';
    } else if (assistantMessages.length > 0) {
        currentStep = 'explicacao_agente';
    }

    // Mantido para compatibilidade (revenue/requested_amount não são coletados ativamente mas podem existir no contexto)
    let revenue = findValueForQuestion(history, ["faturamento médio mensal", "faturamento medio mensal"]);
    let requested_amount = findValueForQuestion(history, ["valor de empréstimo", "valor de emprestimo", "deseja simular"]);

    // --- 2) INTENÇÕES (REGEX + SEMÂNTICA HÍBRIDA) ---
    const isAgentButtonClick = /^falar com um agente!?$/i.test(lastUserLower);

    const isSelfSimulationRequest =
        /\b(simular?|simula[çc][ãa]o)\b/i.test(lastUserLower) &&
        /\b(vc|voc[eê]|tu|pra mim|por mim|para mim|me faz|poderia|consegue|conseguiria|faz(er)? (para |pra |por )?mim|faz (voc[eê]|vc))(?![a-z0-9])/i.test(lastUserLower);

    const isLinkRequest = !isSelfSimulationRequest && (
        /\b(simular|simula[çc][ãa]o)\b/i.test(lastUserLower) ||
        (/\b(quero|manda|mande|envia|passa|passe|pode|me d[áa]|mandar)\b/i.test(lastUserLower) && /\b(link|simul|proposta|an[áa]lise)\b/i.test(lastUserLower)) ||
        (/^link$/i.test(lastUserLower)) ||
        semanticIntent === "SIMULATION_REQUEST"
    );

    const isOptInAccepted = /\b(autorizo|sim,?\s*autorizo|sim|concordo|aceito|de acordo)\b/i.test(lastUserLower) && !/\b(n[ãa]o)\b/i.test(lastUserLower);
    const isAffirmative = (/\b(s[ií]+m+|pode|manda|mande|envia|bora|aceito|ok|beleza|correto|confirm[ao]|show|com certeza|isso|exato|exatamente|claro|positivo|verdade|de acordo|fechou)\b/i.test(lastUserLower) || isLinkRequest) && !/\b(n[ãa]o|como|como assim)\b/i.test(lastUserLower);
    const isNegative = /\b(não|nao|negativo|parar|cancelar|não quero|nem pensar|jamais|agora não|agora nao|deixa pra depois)\b/i.test(lastUserLower);

    const regexDoubt = /\b(dúvida|duvida|como|como assim|como funciona|saber mais|explica|entender|oque é|o que é|golpe|seguro|fraude|confiável|taxa|juros|bmp|banco|garantia|prazo|boleto|falar com um agente|porque|objetivo|garantias|quem é você|quem e voce|você é bot|voce e bot|é um robô|e um robo|portal|senha|login|cadastrais|cadastro|maquininha|filiação|filiaca|endereço|endereco|cnae|pat|dirf|rendimentos|assistência|assistencia|chaveiro|eletricista|encanador|reembolso|corte|antecipação|antecipacao|contrato|anuidade|tarifa|adesão|adesao|mensalidade)\b/i.test(lastUserLower);
    const isDoubt = regexDoubt || semanticIntent === "DOUBT"; 

    const regexHuman = /\b(atendimento|falar com|conversar com|passar para|chamar|quero|preciso)\b.*\b(humano|persona|atendente|vendedor|algu[ée]m|especialista|assessor|fone|telefone|ligar|ligação)\b/i.test(lastUserLower) || /^(atendente|assessor|humano|pessoa|fone|telefone)$/i.test(lastUserLower);
    const isHumanRequest = (regexHuman || semanticIntent === "HUMAN_HANDOFF") && !isAgentButtonClick;

    const isFarewell = /\b(obrigado|obrigada|vlw|valeu|entendido|entendi|tchau|at[ée] logo|por enquanto [ée] s[óo]|nada mais|encerrar|show)\b/i.test(lastUserLower);
    const isGreeting = /^(oi|ol[aá]|bom dia|boa tarde|boa noite|oie|opa)$/i.test(lastUserLower);

    const regexComplaint = (/\b(atraso|problema|errado|reclamação|ruim|péssimo|horrível|lixo|merda|falha|não funciona|nao funciona|está ruim|está péssimo)\b/i.test(lastUserLower) || (/\b(n[ãa]o recebi|nao recebi)\b/i.test(lastUserLower) && !/reembolso/i.test(lastUserLower)));
    const isComplaint = regexComplaint || semanticIntent === "COMPLAINT";

    const checkIfComplaint = (msgText) => {
        const textLower = String(msgText || "").toLowerCase();
        return (/\b(atraso|problema|errado|reclamação|ruim|péssimo|horrível|lixo|merda|falha|não funciona|nao funciona|está ruim|está péssimo)\b/i.test(textLower) || (/\b(n[ãa]o recebi|nao recebi)\b/i.test(textLower) && !/reembolso/i.test(textLower)));
    };

    const previousClientComplaints = history
        .filter(m => !['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || m.role || m.sender || m.direction).toLowerCase()))
        .filter(m => checkIfComplaint(m.content || m.text));

    const isFirstComplaint = previousClientComplaints.length === 0;
    const effectiveComplaint = isComplaint && !isFirstComplaint;

    // --- 3) GESTÃO DINÂMICA DE INCIDENTES (Smart Match V2) ---
    let forcedIncidentText = null;
    const activeIncidents = agent.active_incidents || [];
    const incidentIdFromPayload = rpcData.payload?.incident_id;
    let isLinkIssue = false;

    const currentCampaignId = rpcData.p_metadata?.campaign_id || leadInfo.campaign_id || ctx.campaign_id;

    if (incidentIdFromPayload) {
        const specificIncident = activeIncidents.find(i => i.id === incidentIdFromPayload);
        if (specificIncident) {
            forcedIncidentText = specificIncident.response_message;
            isLinkIssue = true;
        }
    }

    if (!forcedIncidentText) {
        for (const incident of activeIncidents) {
            if (incident.mode === 'passive' || incident.mode === 'both') {
                if (incident.campaign_id && incident.campaign_id !== currentCampaignId) continue;

                const triggerWords = incident.problem_description.toLowerCase()
                    .split(/[\s,./]/)
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

    // --- 4) TRANSIÇÕES DE ESTADO (V19: verificacao_cnpj → criar_lead diretamente) ---
    let nextStep = currentStep;
    let transitionApplied = false;

    if (isAgentButtonClick) {
        nextStep = 'explicacao_agente';
        transitionApplied = true;
    } else if (currentStep === 'start') {
        if (!isNegative && !isDoubt) {
            nextStep = 'verificacao_cnpj';
            transitionApplied = true;
        }
    } else if (currentStep === 'explicacao_agente') {
        if (isAffirmative && !isDoubt) {
            nextStep = 'verificacao_cnpj';
            transitionApplied = true;
        }
    } else if (currentStep === 'verificacao_cnpj') {
        if (isAffirmative && !isDoubt) {
            nextStep = 'consentimento_optin';
            transitionApplied = true;
        } else if (isNegative && !isDoubt) {
            nextStep = 'coleta_cnpj_correto';
            transitionApplied = true;
        }
    } else if (currentStep === 'consentimento_optin') {
        if (isOptInAccepted) {
            nextStep = 'criar_lead';
            transitionApplied = true;
        } else if (isNegative && !isDoubt) {
            nextStep = 'optin_recusado';
            transitionApplied = true;
        } else {
            nextStep = 'consentimento_optin';
            transitionApplied = true;
        }
    } else if (currentStep === 'coleta_cnpj_correto') {
        if (!isDoubt) {
            nextStep = 'coleta_nome_estabelecimento';
            transitionApplied = true;
        }
    } else if (currentStep === 'coleta_nome_estabelecimento') {
        if (!isDoubt) {
            nextStep = 'encaminhamento_correcao';
            transitionApplied = true;
        }
    // V19: REMOVIDOS os blocos de coleta_faturamento e coleta_valor
    } else if (currentStep === 'aguardando_fiserv') {
        if (isAffirmative && !isDoubt) {
            nextStep = 'apresenta_ofertas';
            transitionApplied = true;
        } else if (isNegative && !isDoubt) {
            nextStep = 'recusa_analise';
            transitionApplied = true;
        } else {
            nextStep = 'aguardando_fiserv';
            transitionApplied = true;
        }
    } else if (currentStep === 'apresenta_ofertas') {
        if (!isDoubt) {
            nextStep = 'confirmacao_cliente';
            transitionApplied = true;
        }
    } else if (currentStep === 'confirmacao_cliente') {
        if (isAffirmative && !isDoubt) {
            nextStep = 'finalizacao_sucesso';
            transitionApplied = true;
        } else if (isNegative && !isDoubt) {
            nextStep = 'apresenta_ofertas';
            transitionApplied = true;
        }
    }

    // --- 5) MODO DE RESPOSTA ---
    let mode = "consultive";
    if (leadInfo.is_lead === false || (transitionApplied && !isDoubt) || isAgentButtonClick || isHumanRequest || isLinkIssue || effectiveComplaint) {
        mode = "parrot";
    }
    if (isLinkRequest && !isDoubt) {
        mode = "parrot";
    }
    if ((isDoubt || isFarewell) && !isAgentButtonClick && !isHumanRequest && !isLinkIssue && leadInfo.is_lead !== false) {
        mode = "consultive";
    }
    if (isSelfSimulationRequest && leadInfo.is_lead !== false) {
        mode = "consultive";
    }

    // --- 6) PROMPT FINAL ---
    let activeConfig = blueprint.steps[nextStep] || blueprint.steps["start"];
    if (isAgentButtonClick) activeConfig = blueprint.steps["explicacao_agente"];

    let forcedText = String(activeConfig?.rules || "");

    if (leadInfo.is_lead === false) {
        forcedText = `Olá${leadInfo.name ? ', ' + leadInfo.name : ''}! Tudo bem?\nNotei aqui que você ainda não possui um credenciamento ativo ou seus dados não constam na nossa base de ofertas pré-aprovadas no momento.\n\nPara realizar o seu credenciamento e ter acesso às nossas soluções de crédito e benefícios da Ticket, envie uma mensagem pelo WhatsApp para a nossa Central no número *11 4004-2233* ou acesse diretamente o link https://wa.me/551140042233.\n\nAssim que estiver tudo certinho, estarei por aqui!`;
        mode = "parrot";
        nextStep = "start";
    } else if (isAgentButtonClick) {
        forcedText = `Olá! Sou a Sofia, especialista da *Ticket*. Que bom que você quer saber mais!\n\nExplicando rapidamente: este é um reforço de caixa exclusivo para parceiros Ticket. Você pode ter de *R$ 10 mil a R$ 500 mil* com taxas a partir de *1,89% a.m.* O dinheiro cai na sua conta em até *24h* e o pagamento é feito via boleto bancário, sem comprometer seu limite de crédito.\n\n👉 Gostaria de fazer uma simulação do valor exato aqui mesmo pelo WhatsApp agora ou prefere tirar alguma dúvida antes? 📈`;
    } else if (isLinkIssue && forcedIncidentText) {
        forcedText = forcedIncidentText;
    } else if (isHumanRequest) {
        const isPhone = /\b(fone|telefone|ligar|ligação)\b/i.test(lastUserLower);
        if (isPhone) {
            forcedText = `Certo, ${leadInfo.name || "parceiro"}! Para um atendimento mais detalhado e personalizado pelo telefone, recomendo que entre em contato diretamente com a nossa Central de Atendimento através do número *4004-2233*. \n\nEles estarão prontos para ajudar com todas as suas dúvidas sobre o reforço de caixa! 📞`;
        } else {
            forcedText = `Claro, entendo.\n\nVou solicitar para que um assessor entre em contato com você pelo WhatsApp em até 2 dias úteis e siga com o seu atendimento.\n\nEnquanto isso, se quiser tirar alguma dúvida pontual por aqui, estou à disposição.`;
        }
    } else if (effectiveComplaint) {
        forcedText = `Certo, entendo perfeitamente sua frustração. Sinto muito que sua experiênca atual esteja sendo assim. \n\nComo você mencionou esse problema, vou priorizar o seu contato com um de nossos consultores humanos para que ele verifique isso detalhadamente antes de qualquer outra coisa. \n\nVocê gostaria de falar sobre mais algum ponto específico antes do nosso especialista entrar em contato?`;
    } else if (currentStep === 'start' && assistantMessages.length < 2) {
        forcedText = `Já pensou em reforçar o caixa sem burocracia?\n \nVocê pode ter até *R$ 500 mil* disponíveis, usando apenas seus recebíveis Ticket como garantia. A consulta é rápida e sem compromisso.\n\n✅ Taxas a partir de *1,89% a.m*;\n✅ Crédito disponível entre *10 mil a 500 mil reais*;\n✅ Recebimento do dinheiro em até *24h*;\n\n👉 Gostaria de fazer uma simulação sem compromisso aqui mesmo pelo WhatsApp ou ficou com alguma dúvida?`;
    } else if (nextStep === 'explicacao_agente') {
        forcedText = `Olá! Sou a Sofia, especialista da *Ticket*. Que bom que você quer saber mais!\n\nExplicando rapidamente: este é um reforço de caixa exclusivo para parceiros Ticket. Você pode ter de *R$ 10 mil a R$ 500 mil* com taxas a partir de *1,89% a.m.* O dinheiro cai na sua conta em até *24h* e o pagamento é feito via boleto bancário, sem comprometer seu limite de crédito.\n\n👉 Gostaria de fazer uma simulação do valor exato aqui mesmo pelo WhatsApp agora ou prefere tirar alguma dúvida antes? 📈`;
    } else if (nextStep === 'consentimento_optin') {
        const OPTIN_TEXT_OFICIAL = `O (Cliente/Estabelecimento) CONFERE E OUTORGA autorização à Fiserv Sociedade de Crédito Diretos S.A., sociedade com sede na Av. das Nações Unidas, 14.171, Condomínio Rochaverá Corporate Towers, Bloco Marble, 9º andar, Brooklin Novo, São Paulo - SP, CEP 04794-000, inscrita no CNPJ/MF sob o nº 50.053.267/0001-15 (“Fiserv”), bem como aos seus parceiros de negócio, de forma irrevogável e irretratável, para:(i) Acessar a sua Agenda de Recebíveis em Entidades Registradoras, inclusive junto a outras instituições de pagamento ou instituições financeiras que prestem serviços de credenciamento ao (Cliente/Estabelecimento), com a finalidade de identificar Unidades de Recebíveis que não estejam sujeitas a ônus, gravames ou restrições de cessão de qualquer natureza;(ii) Consultar e compartilhar informações junto ao Sistema de Informações de Crédito (SCR) do Banco Central do Brasil, bem como junto a bureaus de crédito, incluindo mas não se limitando à SERASA, para fins de análise de crédito, avaliação de risco e conformidade regulatória; (iii) Tratar os dados pessoais e financeiros do (Cliente/Estabelecimento) em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 - LGPD), garantindo a segurança, confidencialidade e uso adequado das informações, exclusivamente para os fins aqui autorizados. O (Cliente/Estabelecimento) declara e se responsabiliza que a autorização ora concedida foi firmada por representante legal devidamente habilitado, sob pena de incorrer em responsabilidade civil pelos prejuízos decorrentes da eventual ausência de poderes.`;
        forcedText = `Perfeito, ${leadInfo.name || "parceiro"}! ✅

Para a *Fiserv* analisar seu crédito, ela precisa da sua autorização para consultar seus recebíveis e informações de crédito. Segue a autorização:

${OPTIN_TEXT_OFICIAL}

Para autorizar e seguir com a análise, responda *SIM*, *ACEITO* ou *AUTORIZO*. Se preferir não seguir agora, é só me avisar.`;
    } else if (nextStep === 'optin_recusado') {
        forcedText = `Sem problema, ${leadInfo.name || "parceiro"}. Gostaríamos de reforçar que só podemos seguir com a análise de crédito se você aceitar a pesquisa pela Fiserv. Se mudar de ideia, é só me chamar aqui que retomamos. 👍`;
    // V19: Mensagem de confirmação antes de chamar a API Fiserv (Avaliação de Crédito - Passo 6)
    } else if (nextStep === 'criar_lead') {
        forcedText = `Perfeito, ${leadInfo.name || "parceiro"}! ✅\n\nVou enviar suas informações agora para a Fiserv fazer a avaliação de crédito do seu CNPJ *${leadInfo.cnpj || ""}*.\n\nA análise é rápida e te retorno aqui mesmo com o resultado em instantes. Aguarde um momento! 🔄`;
    }

    forcedText = forcedText
        .replace(/{{lead_info\.cnpj}}/gi, `*${leadInfo.cnpj || "não informado"}*`)
        .replace(/{{lead_info\.name}}/gi, `*${leadInfo.name || "não informado"}*`)
        .replace(/{{simulation_offers}}/gi, ctx.simulation_offers || "Não há propostas disponíveis")
        .replace(/{{installments}}/gi, ctx.chosen_installments || "24")
        .replace(/{{installment_value}}/gi, ctx.chosen_installment_value || "0,00")
        .replace(/{{interest_rate}}/gi, ctx.chosen_interest_rate || "1,89");

    const normalizeText = (text) => {
        return String(text || "").toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    };

    const cleanNextText = normalizeText(forcedText);
    const cleanLastSofiaMsg = normalizeText(lastSofiaMsg);
    const isLoopDetected = mode === 'parrot' && cleanNextText === cleanLastSofiaMsg && cleanNextText.length > 0;

    let loopDetectedHandoff = false;
    if (isLoopDetected && leadInfo.is_lead !== false) {
        loopDetectedHandoff = true;
        forcedText = `Certo, ${leadInfo.name || "parceiro"}. Vejo que estamos repetindo a mesma orientação e não conseguimos avançar. Para não tomarmos mais seu tempo, estou transferindo você agora mesmo para um especialista humano examinar sua situação detalhadamente. Um instante!`;
        mode = "parrot";
    }

    let finalPrompt = "";
    if (mode === "parrot") {
        finalPrompt = `<RULES>
- VOCÊ ESTÁ EM MODO MÁQUINA DE REPETIÇÃO (PARROT MODE).
- É ESTRITAMENTE PROIBIDO RESPONDER À MENSAGEM DO USUÁRIO OU ADICIONAR QUALQUER CONTEXTO.
- SUA ÚNICA E EXCLUSIVA FUNÇÃO É REPETIR O TEXTO EXATO FORNECIDO DENTRO DA TAG <RESPOSTA_OBRIGATORIA>.
- NÃO INVENTE REGRAS. NÃO FALE SOBRE DIVERGÊNCIAS DE CNPJ. NÃO ADICIONE SAUDAÇÕES.
- IGNORE COMPLETAMENTE O QUE O USUÁRIO DISSE E O HISTÓRICO DA CONVERSA.
- QUALQUER TEXTO ALÉM DO QUE ESTÁ NA RESPOSTA OBRIGATÓRIA CAUSARÁ FALHA NO SISTEMA.
</RULES>

<CONTROLE_DE_FLUXO>
<RESPOSTA_OBRIGATORIA>
${forcedText}
</RESPOSTA_OBRIGATORIA>
</CONTROLE_DE_FLUXO>`;
    } else {
        const formattedHistory = history.map(m => {
            const isBot = ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || m.role || m.sender || m.direction).toLowerCase());
            const sender = isBot ? "Sofia (Você)" : "Cliente";
            return `- ${sender}: "${m.content || m.text || ""}"`;
        }).join("\n");

        const hintInjection = semanticReasoning ? `
<nota_interna_do_sistema>
[ATENÇÃO SOFIA - TRADUÇÃO DE INTENÇÃO]: O sistema analisou a última mensagem do cliente e concluiu:
- Intenção Real Detectada: ${semanticIntent}
- Tradução/Motivo: ${semanticReasoning}
Use essa nota para entender gírias, abreviações ou erros de digitação. NUNCA mencione que você leu esta nota.
</nota_interna_do_sistema>
` : "";

        finalPrompt = `<identity>
Você é Sofia, consultora sênior da Ticket Edenred.
Sua comunicação deve ser impecável: profissional, segura e visualmente organizada para WhatsApp.
</identity>
${hintInjection}
<diretrizes_estilo_visual>
- NEGRITO: Use *asteriscos* para destacar termos importantes (Ex: *Boleto Bancário*, *Sem conta nova*, *24 parcelas*).
- EMOJIS (REGRA DE HISTÓRICO COMPLETO): Você está autorizada a usar no máximo **1 único emoji em toda a conversa** (considerando todo o histórico de mensagens). Analise o histórico: se você ou o cliente já usaram algum emoji nas mensagens anteriores, você está **PROIBIDA** de enviar qualquer emoji nesta resposta. Se nenhum emoji foi usado ainda na conversa, você pode enviar **apenas 1**, preferencialmente o emoji correspondente ao segmento da empresa (ex: Padaria 🍞, Farmácia 💊, Restaurante 🍽️, Oficina/Auto 🚗, Mercado 🛒, Café ☕, Geral 📈) posicionado sempre no início ou no fim da mensagem, nunca no meio de frases.
- PARÁGRAFOS: Use quebras de linha para não criar "paredões" de texto.
</diretrizes_estilo_visual>

<HISTORICO_CONVERSA>
As mensagens mais recentes da conversa atual estão listadas abaixo (da mais antiga para a mais recente). 
Use esse histórico para contextualizar sua resposta, lembrando do que o cliente já confirmou, negou, relatou ou se já se repetiu:
${formattedHistory}
</HISTORICO_CONVERSA>

<BASE_DE_CONHECIMENTO_FAQ>
--- FAQ PRODUTO (OFERTA DE CRÉDITO E IDENTIDADE) ---

Quem sou eu? / Qual minha empresa? / Você sabe meu nome?
"Claro! Sei sim. Estou falando com o responsável pela empresa *${leadInfo.name || "não informado"}*. Como posso te ajudar com o reforço de caixa hoje?"

Como funciona o empréstimo?
Este é um reforço de caixa exclusivo para parceiros Ticket, realizado em parceria com a Fiserv. Você pode simular valores de *R$ 10.000 a R$ 500.000* com prazos de pagamento de até 24 meses. O pagamento é feito mensalmente por boleto bancário e a garantia da operação são apenas seus recebíveis Ticket futuros (o que significa que você não precisa comprometer bens físicos como automóveis ou imóveis). A análise inicial é rápida e leva menos de 24h.

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

O que significa usar os recebíveis como garantia?
Significa que a Fiserv Capital utilizará os seus recebimentos Ticket como garantia, assim você não precisa comprometer seus bens como imóvel ou carro para garantia de pagamento da dívida. 

Com quanto tempo de atraso no pagamento via boleto acarretará em desconto via recebíveis Ticket?
Se o estabelecimento ficar entre 3 a 4 meses sem realizar os devidos pagamentos via boleto bancário, a Fiserv fará o desconto via recebível Ticket. Após a quitação dos boletos in atraso, o pagamento voltará a ser feito via boleto.

O valor que eu solicitar será o valor que será aprovado para mim?
Não necessariamente. O valor desejado é uma base, mas após você informá-lo, faremos uma análise de crédito para avaliar seus dados e definir o limite final, que pode ser menor ou maior que o solicitado. Mas não se preocupe, faremos o possível para ao menos alcançar o valor desejado.

Posso aumentar meu limite aprovado? Como consigo uma oferta de crédito?
Sabemos que o Empréstimo Ticket pode ser um grande apoio para o crescimento do seu negócio, mas não podemos garantir uma oferta, pois ela depende dos critérios de análise. Você pode aumentar suas chances mantendo suas informações sempre atualizadas. Nosso time usa seus dados para fazer a análise de crédito, então quanto mais soubermos sobre o seu negócio, maiores as chances de aprovação.

Prefiro realizar antecipações de recebíveis
Entendi, mas o crédito Fiserv não inviabiliza a contratação de antecipações, e funciona como um complemento das antecipações possibilitando que você tenha mais investimento para a expansão do seu negócio, pagar custos adicionais, antecipar fornecedores, aumentar fluxo de caixa, etc. Além disso, é apenas uma simulação sem compromisso, você pode avaliar se o empréstimo possui condições vantajosas pra você.

Não quero pagar via boleto, tem outro método?
Esse é o método de pagamento que utilizamos atualmente, mas em breve teremos a possibilidade do desconto automático diário das vendas (TPV). Você pode pagar as primeiras parcelas nesse formato e posteriormente migrar para esse novo formato.

Tenho taxas melhores em outros bancos/empresas, não tenho interesse.
A nossa taxa é uma das melhores do mercado no momento, como falei, não é uma taxa fixa, ela é personalizável para cada cliente, o que ajuda a ter condições melhores. Você pode solicitar a análise apenas para conhecer as condições disponíveis para o seu CNPJ e assim comparar o melhor custo benefício.

Como posso validar se não é golpe?
Você pode validar através do Portal Ticket onde temos banners sobre a parceria, ou entrar em contato com a nossa Central de Atendimento através do número 4004-2233, e questionar sobre a oferta de crédito para a pessoa que realizar o seu atendimento!

O que é BMP?
BMP Sociedade de Crédito Direto S/A é uma instituição financeira aprovada pelo Banco Central do Brasil parceira da Ticket e Fiserv Capital. Ela oferece soluções bancárias integradas, como contas digitais e pagamentos, permitindo que empresas usem essas funcionalidades sem precisar criar toda a estrutura do zero.

O que seria essa nova conta BMP?
Para que os seus recebíveis Ticket possam ser utilizados como garantia, faremos a alteração do seu domicílio bancário cadastrado com a Ticket para uma nova conta do banco BMP vinculada a uma trava bancária, que ficará ativa até a quitação total do empréstimo. Os recebíveis Ticket passarão a ser depositados nessa nova conta e serão repassados para a uma conta de preferência que você informará no momento da contratação do empréstimo. Só haverá a retenção do seu recebível Ticket in caso de não pagamento do boleto bancário.

O que é Trava Bancária?
A trava de domicílio é o que nos permite usar seus recebíveis Ticket como garantia do pagamento, sua vendas futures são bloqueadas e direcionadas automaticamente para o banco BMP para pagamento da dívida, caso o boleto não seja pago. Nesse caso, você não poderá usar esses recebíveis Ticket in outros lugares até a quitação.

Qual a data final da trava de domicílio?
Quando for finalizado o pagamento das parcelas, iremos informá-lo para que realize a alteração bancária para uma conta que deseja voltar a receber os recebíveis Ticket.

Meu domicilio ficará na BMP após pagamento do empréstimo ou posso alterar?
Após a quitação do empréstimo você poderá retornar para o seu domicilio de preferência, basta acessar o Portal do Estabelecimento e solicitar a alteração.

Eu não posso alterar meu domicilio durante esse tempo?
Infelizmente não, durante o período em que o empréstimo estiver ativo, seu domicílio bancário com a Ticket fica vinculado à conta do banco BMP, como parte da garantia da operação. Essa alteração é temporária e serve apenas para permitir que os recebíveis Ticket passsem por essa conta antes de serem repassados para a conta que você escolher no momento da contratação. Depois que todas as parcelas forem quitadas, você poderá alterar seu domicílio bancário normalmente pelo Portal do Estabelecimento.

--- FAQ INSTITUCIONAL TICKET (ATUALIZADO) ---

Preciso acessar o Portal da Ticket para simular ou pedir o empréstimo?
Não. Você não precisa acessar o Portal da Ticket para realizar a simulação. Nós fazemos a simulação e análise de crédito de forma rápida e segura aqui mesmo pelo WhatsApp. O Portal da Ticket é para outros assuntos, como consultar extratos ou dados.

Como eu acesso o Portal do Estabelecimento?
Acesse https://portalestabelecimento.ticket.com.br/. Se for o primeiro acesso, clique em "Crie sua conta Ticket" no rodapé, digite seu CNPJ, crie uma senha e confirme com o código que será enviado para o e-mail cadastrado no credenciamento.

Esqueci a senha do Portal. O que devo fazer?
No Portal do Estabelecimento, clique em "Esqueci minha senha", confirme seu e-mail e clique em "Enviar" para receber as instruções. Não se esqueça de checar as caixas de Spam e Lixo Eletrônico.

A página do Portal está em branco. Como consigo visualizar?
Se a página ficar em branco ou não carregar, siga estes passos: 1) Acesse o Portal por outro navegador; 2) Use uma janela/guia anônima; 3) Se persistir, limpe o cache e os cookies do navegador, feche-o e abra novamente; 4) Caso nada funcione, reinicie o computador.

Como eu faço para mudar minha conta bancária?
Por segurança, a alteração de dados bancários só é feita pelo Portal do Estabelecimento em "Minha Conta" > "Dados Bancários" pelo próprio representante legal. Você precisará anexar: Contrato Social, Identidade do sócio (CNH/RG/Passaporte/RNE) e Comprovante Bancário da nova conta. Há necessidade de validação facial via câmera dos sócios. Se houver mais sócios administradores no Contrato Social, todos deverão fazer a validação facial e enviar o documento em até 72 horas (caso contrário, a solicitação expira e deve ser reiniciada).

Não estou conseguindo alterar minha conta. O que eu faço?
Se ocorrer qualquer erro no Portal durante o processo de alteração bancária, acione nossa Central de Atendimento no telefone 4004-2233 para obter suporte.

Qual o prazo para alterar meus dados bancários?
A alteração é concluída em até 2 dias úteis após a conclusão do envio de todos os documentos e realização das etapas de segurança (validação facial).

Onde vejo o andamento do meu pedido de alteração de dados bancários?
Acompanhe pelo Portal do Estabelecimento em "Minha Conta" > "Dados Bancários". A conta sob alteração apresentará o status "Em andamento". Você pode ver os detalhes e a etapa atual clicando na seta da listagem, ou consultar em "Ver histórico de solicitações" no canto inferior direito. Também enviamos e-mails de atualização ao longo de todo o processo.

Onde eu encontro o meu contrato Ticket?
Acesse o Portal do Estabelecimento, vá no menu "Minha Conta" > "Contrato". Lá você poderá baixar seu contrato e o formulário dos produtos contratados clicando no ícone de Download (uma seta azul para baixo).

Onde consulto as informações das taxas e tarifas?
No Portal do Estabelecimento, vá em "Minha Conta" > "Produtos e taxas". Escolha o produto que quer consultar e clique na opção "Taxas e tarifas".

Como funcionam as taxas e tarifas do meu contrato?
Elas variam conforme seu contrato e a campanha ativa no seu credenciamento. As principais taxas são:
- Anuidade: Manutenção cobrada a cada 12 (doze) meses.
- Tarifa de Adesão: Tarifa única, cobrada no 1º mês (se o reembolso do mês não cobrir, é parcelada nos meses seguintes).
- Gestão de Pagamento: Cobrada a cada reembolso (ocorrem a cada 7 dias, totalizando 4 vezes no mês).
- Tarifa de Transação: Cobrada a cada transação com cartão passada na maquininha.
- Taxa de Administração: Porcentagem cobrada sobre a utilização dos nossos serviços.
- Mensalidade: Tarifa de manutenção cobrada mensalmente.

Como funciona o reembolso, a data de corte e o prazo?
O prazo de reembolso (se in 7 ou 30 dias) segue o que foi contratado. O "período de corte" é o intervalo de 7 dias onde as vendas são acumuladas. O "dia de corte" é o dia da semana em que o reembolso fecha (ex: se o corte for na quarta, acumula as vendas dos últimos 7 dias e gera o lote que será pago em 30 dias). Consulte seu dia de corte no Portal em "Extrato".

Como faço para gerar o relatório dos meus reembolsos?
Acesse o Portal > "Extrato". Selecione o período, o produto aceito (ex: Ticket Alimentação ou Ticket Restaurante) e filtre para conferir os extratos de Reembolso, Transações ou Detalhado. Você pode exportar o arquivo em Excel ou PDF.

Como realizo a antecipação dos meus recebimentos?
Acesse o Portal, faça login e clique em "Antecipação" no menu superior. As modalidades são:
- EVENTUAL: Antecipe quando precisar. Recebe no mesmo dia se solicitado até 13h, ou no dia seguinte se feito após as 13h.
- AUTOMÁTICO: Recebimento semanal automático no dia seguinte ao fechamento das vendas.

Não recebi meu reembolso, o que devo fazer?
1) Se mudou de conta bancária, certifique-se de que a alteração foi concluída e atualizada no Portal. 2) Confirme a data de pagamento e o valor na aba "Extrato" no Portal. 3) Se não localizar, entre em contato com nossa Central de Atendimento no telefone 4004-2233 portando o extrato bancário e a cópia de sua folha de cheque.

Onde consulto as vendas que meu estabelecimento irá receber?
No Portal do Estabelecimento, na aba "Extrato". Em "Reembolso", você confere os valores que tem a receber. Em "Transações", você confere as vendas que realizou.

Onde encontro o número de filiação da minha máquina?
Você o localiza no "slip" (o comprovante de venda impresso pela maquininha). Se sua maquininha não imprime comprovantes, consulte diretamente a operadora da maquininha do estabelecimento.

Onde posso alterar os meus dados cadastrais?
Acesse o Portal, vá em "Minha Conta" > "Dados Cadastrais" e clique em "Editar" para atualizar seu e-mail de acesso, nome Fantasia, endereço e telefone do estabelecimento. Alterações de endereço exigem o anexo de um comprovante e levam até 5 dias úteis. Outros dados (como contato principal ou interlocutor) só podem ser alterados via Central 4004-2233.

Tenho mais de um CNPJ. Como faço para ter visão unificada no Portal?
Acesse o Portal, clique na seta ao lado de sua Razão Social (topo) e selecione "Administrar CNPJs" > "Agrupar CNPJ". Insira o CNPJ e senha dos acessos que deseja agrupar.

Como funciona a Assistência 24h para estabelecimentos (cobertura e custos)?
Ela é válida por 12 meses após o primeiro pagamento e custa R$ 29,90 mensais (descontados do reembolso). Oferece serviços de emergência como: Chaveiro (limite de 1 acionamento anual para cópia de chave e 3 para segredo de fechadura), Eletricista e Encanador (3 acionamentos anuais para cada), cobertura provisória de telhados (1 acionamento), vigilância, limpeza, helpdesk de informática, dedetização, etc. Para acionar ou cancelar os serviços ligue: 11-4196-8187 (São Paulo) ou 0800-771-7311 (demais cidades).

Onde consulto o informe de rendimentos (DIRF)?
No Portal do Estabelecimento, clique no botão rápido "DIRF-Informe de rendimentos" localizado na tela principal.

O que é o PAT e o CNAE?
O PAT (Programa de Alimentação do Trabalhador) visa promover a alimentação saudável de trabalhadores usando benefícios fiscais concedidos às empresas. O CNAE é a Classificação de Atividades Econhibicionais da sua empresa. De acordo com as leis do PAT, somente estabelecimentos com CNAEs compatíveis com alimentação e refeição podem se credenciar para aceitar Ticket.

Como realizar o credenciamento do meu estabelecimento na Ticket?
Envie uma mensagem pelo WhatsApp para a nossa Central no número 11 4004-2233 ou acesse diretamente o link https://wa.me/551140042233 para ser direcionado e realizar o credenciamento.
</BASE_DE_CONHECIMENTO_FAQ>

<REGRA_CTA_OBRIGATORIA>
Ao final das suas explicações, se não houver um fluxo obrigatório a ser seguido, você deve OBRIGATORIAMENTE terminar sua resposta pulando uma linha e perguntando se o cliente gostaria de seguir com a simulação.
Exemplo: "*Posso seguir com a simulação do seu CNPJ ou tem mais alguma dúvida?*"
</REGRA_CTA_OBRIGATORIA>



<regra_de_detalhamento_obrigatorio>
Estas informações são OBRIGATÓRIAS e NUNCA podem ser omitidas quando o assunto surgir:

1. INADIMPLÊNCIA / NÃO PAGAMENTO:
   - SEMPRE mencione que o desconto via recebíveis só ocorre após *3 a 4 meses* sem pagamento.
   - NUNCA diga apenas "seus recebíveis poderão ser retidos" sem especificar o prazo.
   - SEMPRE informe que após regularizar os boletos, o pagamento volta ao método de boleto.

2. GARANTIA DO EMPRÉSTIMO:
   - Responda apenas sobre o que foi perguntado: os recebíveis Ticket como garantia.
   - NÃO introduza espontaneamente conceitos de BMP, trava bancária ou domicílio bancário se o cliente não perguntou sobre isso. Esses temas têm entrada própria no FAQ e devem ser explicados apenas quando diretamente perguntados.
</regra_de_detalhamento_obrigatorio>

<tom_de_voz>
- COMEÇO NATURAL: Comece as respostas de forma simples: "Certo", "Entendi", "Perfeito" ou "Vamos lá", sempre seguido do nome do cliente. 
- PROIBIDO: Iniciar com frases robóticas ou clichês de IA como "Entendo sua dúvida" ou "Entendo sua preocupação". Seja direta e humana.
- DETALHAMENTO NECESSÁRIO: Responda com o nível de detalhe necessário para sanar a dúvida, sem inventar informações. Priorize a precisão técnica do FAQ.
- ESCOPO DA RESPOSTA: Responda apenas o que foi perguntado. Não antecipe conceitos técnicos não solicitados — isso confunde em vez de ajudar.
- EVITE REPETIÇÃO: Se o cliente insistir em um assunto ou fizer perguntas de acompanhamento, evite repetir a mesma resposta anterior palavra por palavra. Varie a explicação mantendo a precisão do FAQ.
- FOCO NO NEGÓCIO: Se o cliente fizer perguntas totalmente fora de contexto (clima, esportes, notícias), responda de forma gentil que você é uma especialista em crédito e não possui essa informação, convidando-o a tirar dúvidas sobre o reforço de caixa.
</tom_de_voz>

<empatia_e_personalizacao>
- EMOJI POR SEGMENTO: Analise o nome da empresa (${leadInfo.name}). Se identificar o tipo de negócio (Ex: Padaria, Farmácia, Restaurante, Oficina), use UM emoji relacionado em momentos oportunos da conversa para gerar empatia. 
- NATURALIDADE: Não use o emoji em todas as mensagens para não ficar cansativo. Use apenas quando fizer sentido no contexto da explicação ou na saudação/despedida.
- EXEMPLOS DE MAPEAMENTO: Padaria 🍞, Farmácia 💊, Restaurante 🍽️, Oficina/Auto 🚗, Mercado 🛒, Consultoria/Serviços 💼, Café ☕, Açougue 🥩.
</empatia_e_personalizacao>

<regra_de_ouro>
NUNCA invente taxas ou condições. Se a dúvida for sobre o funcionamento técnico, use APENAS os textos da BASE_DE_CONHECIMENTO_FAQ acima — incluindo TODOS os detalhes presentes no FAQ, especialmente prazos e condições específicas.
</regra_de_ouro>

<CONTEXTO_ATUAL>
- Passo: ${nextStep}
- Link Enviado: ${linkAlreadySent}
- Nome da Empresa: ${leadInfo.name}
- Encerramento Detectado: ${isFarewell}
</CONTEXTO_ATUAL>`;
    }

    finalPrompt = finalPrompt
        .replace(/{{lead_info\.cnpj}}/gi, `*${leadInfo.cnpj || "não informado"}*`)
        .replace(/{{lead_info\.name}}/gi, `*${leadInfo.name || "não informado"}*`)
        .replace(/{{simulation_offers}}/gi, ctx.simulation_offers || "Não há propostas disponíveis")
        .replace(/{{installments}}/gi, ctx.chosen_installments || "24")
        .replace(/{{installment_value}}/gi, ctx.chosen_installment_value || "0,00")
        .replace(/{{interest_rate}}/gi, ctx.chosen_interest_rate || "1,89");

    return {
        final_system_prompt: finalPrompt,
        p_conversation_id: rpcData.conversation?.id || rpcData.p_conversation_id,
        currentStep: nextStep,
        mode: mode,
        trigger_handoff: (isHumanRequest || effectiveComplaint || loopDetectedHandoff) && !isAgentButtonClick,
        handoff_data: {
            initial_message: currentMsg,
            campaign_id: leadInfo.campaign_id || ctx.campaign_id,
            lead_id: leadInfo.id || ctx.lead_id,
            tenant_id: ctx.tenant_id,
            priority: (effectiveComplaint || loopDetectedHandoff) ? 'high' : 'medium'
        },
        lead_info: {
            cnpj: leadInfo.cnpj,
            phone: rpcData.payload?.phone || leadInfo.phone || ctx.payload?.phone,
            name: leadInfo.name,
            revenue: revenue || leadInfo.revenue,
            requested_amount: requested_amount || leadInfo.requested_amount
        },
        revenue: revenue,
        requested_amount: requested_amount,
        debug: { nextStep, mode, isLinkIssue, isSelfSimulationRequest, currentCampaignId, loopDetected: isLoopDetected, semanticIntent, isComplaint, isFirstComplaint, effectiveComplaint, parsedRevenue: revenue, parsedAmount: requested_amount },
        consent: (currentStep === 'consentimento_optin' && isOptInAccepted) ? {
            opt_in: true,
            opt_in_timestamp: new Date().toISOString(),
            opt_in_ip: rpcData.ip || "0.0.0.0",
            opt_in_signer_name: leadInfo.name || "Cliente",
            consent_channel: "whatsapp",
            consent_phone: leadInfo.phone || "Não informado",
            consent_text_version: "v1-2026-06",
            consent_text_hash: "b919e74d1075bbd1c44fcef663f7e691932d5eb1fe1e54f8b30a3032c2b30d8b",
            confirmation_message: lastUserLower,
            confirmation_message_id: rpcData.message_id || ""
        } : null
    };

} catch (globalError) {
    let fallbackText = "";
    try {
        const blueprint = $node["RPC - Acesso Entrada"].json.context?.agent?.workflow_blueprint || { steps: {} };
        fallbackText = blueprint.steps?.["start"]?.rules || "";
    } catch (e) {}

    if (!fallbackText) {
        fallbackText = "Olá! Sou a Sofia, especialista da *Ticket*. Como posso ajudar você hoje?";
    }

    try {
        const history = $node["RPC - Acesso Entrada"].json.context?.messages_history || [];
        const assistantMessages = history.filter(m =>
            ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || m.role || m.sender || m.direction).toLowerCase())
        );
        if (assistantMessages.length > 0) {
            fallbackText = assistantMessages[assistantMessages.length - 1]?.content || assistantMessages[assistantMessages.length - 1]?.text || fallbackText;
        }
    } catch (e) {}

    try {
        const leadInfo = $node["RPC - Acesso Entrada"].json.context?.lead_info || {};
        fallbackText = fallbackText
            .replace(/{{lead_info\.cnpj}}/gi, `*${leadInfo.cnpj || "não informado"}*`)
            .replace(/{{lead_info\.name}}/gi, `*${leadInfo.name || "não informado"}*`)
            .replace(/{{lead_info\.link}}/gi, leadInfo.link || "https://fiserv.ticket.com.br/simulacao-sofia");
    } catch (e) {}

    return {
        final_system_prompt: `<RULES>
- VOCÊ ESTÁ EM MODO MÁQUINA DE REPETIÇÃO (PARROT MODE).
- É ESTRITAMENTE PROIBIDO RESPONDER À MENSAGEM DO USUÁRIO OU ADICIONAR QUALQUER CONTEXTO.
- SUA ÚNICA E EXCLUSIVA FUNÇÃO É REPETIR O TEXTO EXATO FORNECIDO DENTRO DA TAG <RESPOSTA_OBRIGATORIA>.
</RULES>

<CONTROLE_DE_FLUXO>
<RESPOSTA_OBRIGATORIA>
${fallbackText}
</RESPOSTA_OBRIGATORIA>
</CONTROLE_DE_FLUXO>`,
        p_conversation_id: $node["RPC - Acesso Entrada"].json.conversation?.id || $node["RPC - Acesso Entrada"].json.p_conversation_id,
        currentStep: 'start',
        mode: 'parrot',
        trigger_handoff: false,
        handoff_data: {},
        debug: { globalError: globalError.message, stack: globalError.stack }
    };
}