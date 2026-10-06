/* 🧭 ROTEADOR DE CONTEXTO - JORNADA NATIVA FISERV V28.0 (FUSÃO DE IDENTIDADE COM COLETA DE FATURAMENTO & CNPJ MASCARADO) */
/* MUDANÇAS V28.0:
   1. Fusão de Identidade com Faturamento:
      - Remove a mensagem isolada de verificacao_cnpj do fluxo principal (avanço direto de start/explicacao_agente para coleta_faturamento).
      - Na mensagem de coleta_faturamento, insere a razão social/nome da empresa e o CNPJ mascarado com os 9 últimos dígitos visíveis (ex: **.***.678/0001-90).
      - Função formatCnpjMasked garante a formatação e proteção de privacidade (LGPD).
   2. Tratamento de Divergência de CNPJ em coleta_faturamento:
      - Detecta intenções de negativa/erro de CNPJ ("não é meu", "cnpj errado", "outra empresa", CNPJ_BLOCKED).
      - Direciona para coleta_cnpj_correto solicitando o CNPJ correto, esclarecendo que as condições são exclusivas para credenciados Ticket.
      - Aciona imediatamente trigger_handoff = true com prioridade "high" para a fila de atendimento manual.
   3. Retrocompatibilidade Discreta:
      - Mantém o bloco verificacao_cnpj ativo para leads legados que receberam a mensagem antiga antes da virada de versão.
   4. Preserva 100% das regras da V27.9 (Jornada Pré-Aprovada, Opt-in 30 dias, Anti-Regressão, Anti-Loop, Sanitização de Dados Técnicos, Bloqueio de Recusa Fiserv e FAQs). */
/* MUDANÇAS V27.9:
   1. Suporte a Campanhas de Retomada Pré-Aprovada:
      - Reconhece 'journey_type: pre_approved' nos metadados do lead, do contexto ou da campanha.
      - Pula automaticamente verificacao_cnpj, coleta_faturamento e consentimento_optin, avançando direto para apresenta_ofertas.
      - Aplica valores default estipulados (R$ 50.000 de empréstimo e R$ 80.000 de faturamento) caso não informados.
      - Blindagem Zero-C impede qualquer regressão para etapas cadastrais ou de opt-in.
      - Blindagem 3 isenta leads pré-aprovados externos, permitindo que a Sofia apresente as ofertas e avance para simulação.
   2. Preserva 100% das regras da V27.8 (Dúvidas de Cartão, Anti-Loop, Proibição de Dados Técnicos, Anti-Regressão e Opt-in). */
/* MUDANÇAS V27.8:
   1. Tratamento Inteligente de Dúvidas sobre Cartão/Faturamento:
      - Adiciona 'cartão', 'cartao', 'cartões' e 'só no cartão' em regexDoubt e na etapa coleta_faturamento.
      - Responde com clareza que o faturamento pedido é o total da empresa e que o empréstimo é pago via boleto bancário sem retenção das vendas de cartão.
   2. Acolhimento de Respostas Qualitativas em Faturamento:
      - Reconhece termos como "muito mais", "bem mais", "bastante", "alto" e pede o valor aproximado em reais com cordialidade em vez de repetir a pergunta engessada.
   3. Blindagem Anti-Loop contra Handoff Prematuro para Especialistas:
      - Dúvidas de cartão, perguntas com '?' e respostas qualitativas nunca são tratadas como loop cego.
      - Varia a mensagem se a Sofia já tiver perguntado o faturamento antes, eliminando repetições consecutivas idênticas.
   4. Preserva 100% das regras da V27.7 (Proibição de Dados Técnicos, Blindagem de Recusa, Anti-Regressão e Opt-in). */
/* MUDANÇAS V27.7:
   1. Proibição Absoluta de Dados Técnicos ao Cliente:
      - Sanitização global mandatória de qualquer mensagem, expurgando termos técnicos (loan_request, detail, simulation_data, 422, status codes).
      - Erros de API ou recusas são obrigatoriamente traduzidos para linguagem humanizada, acolhedora e em bom português.
   2. Blindagem Total de Crédito Recusado:
      - Clientes com crédito recusado pelo comitê Fiserv NUNCA mais avançam para apresenta_ofertas ou solicitar_simulacao.
      - Se o cliente perguntar de simulação, taxas ou parcelas após a recusa, a Sofia responde empaticamente que o sistema não gera simulações para propostas não aprovadas e orienta nova análise em 30 dias.
   3. Preserva 100% das regras da V27.6 (Anti-Regressão de Identidade, Preservação de Simulação e FAQs). */
/* MUDANÇAS V27.6:
   1. Correção Crítica na Confirmação de Simulação após Dúvidas:
      - Reconhecimento completo de confirmacao_cliente quando a Sofia pergunta "Podemos seguir nessas condições?" ou "Podemos seguir com a simulação nas condições informadas anteriormente?".
      - Se o cliente tirar dúvidas durante a simulação (ex: "o que é bmp?") e depois clicar em "✅ Sim", avança diretamente para reforco_condicoes.
   2. Blindagem Anti-Regressão de Identidade:
      - Nunca regride para verificacao_cnpj a partir de explicacao_agente ou start se o cliente já confirmou identidade, já possui faturamento/opt-in ou já realizou simulação.
      - Interceptador defensivo forçado que impede reinício de fluxo em qualquer cenário com histórico avançado.
   3. Preservação de Valores Simulados: Recupera automaticamente valor e parcelas do histórico se não extraídos.
   4. Preserva 100% das regras da V27.5 (Opt-in 30 dias, Parrot Mode, FAQs completos, Anti-Loop e parsing de parcelas). */
/* MUDANÇAS V27.5:
   1. Blindagem de Opt-in Prévio (Janela de 30 Dias):
      - Verifica se o cliente já deu aceite nos últimos 30 dias (leadInfo.opt_in || leadInfo.consent?.opt_in).
      - Se já possui opt-in válido, NUNCA mais envia o texto do termo, botão nem PDF de autorização.
      - Ao concluir coleta_valor ou realizar novas simulações, pula direto para a análise/oferta sem repetição.
      - Reutiliza os metadados de auditoria originais (timestamp, hash, signer_name, confirmation_message_id) para a Fiserv.
      - Se o opt-in tiver mais de 30 dias, exige nova autorização em conformidade com a política da Fiserv.
   2. Preserva 100% das regras da V27.4 (Parrot Mode, FAQs completos, Anti-Loop e parsing de parcelas). */
/* MUDANÇAS V27.4:
   1. Opt-in Simplificado (2 mensagens no total):
      - Mensagem 1: Texto legal direto com botão único "✅ SIM, AUTORIZO":
        "Li e entendi o termos de autorização e autorizo o tratamento de meus dados, inclusive para consulta ao SCR/Bacen e Entidades registradoras."
      - Mensagem 2: Envio do PDF "Termo de autorização.pdf".
   2. Removido o botão "NÃO" do opt-in e removido o pre_message intermediário.
   3. Reconhecimento aprimorado do novo texto de opt-in nas mensagens anteriores da assistente. */
/* MUDANÇAS V27.3:
   1. Removida a linha da Central de Atendimento (*4004-2233*) exclusivamente da mensagem de crédito recusado (recusa_analise).
   2. Preservados todos os contatos de portal, credenciamento e dúvidas institucionais. */
/* MUDANÇAS V27.2:
   1. Ajuste no exemplo de valor solicitado: alterado de "10 mil" para "50 mil".
   2. Formatação em itálico e negrito nas linhas de exemplo tanto de faturamento quanto de valor do empréstimo (_Exemplo: *...*_). */
/* MUDANÇAS V27.1:
   1. Correção Definitiva do Reset de Nova Simulação: Ao clicar em "🔄 Nova simulação", anula semanticAmount/semanticInstallments
      herdados do nó de IA prévio, evitando que hasNewNumbers considere os números do histórico como novos inputs.
   2. Blindagem 1 atualizada com (!isRestartSimulation) para não reverter o passo de volta para solicitar_simulacao. */
/* MUDANÇAS V27:
   1. Correção Crítica do Opt-in: Se o cliente aceitou o opt-in ("✅ SIM, AUTORIZO" / "autorizo" / "sim"),
      o fluxo é FORÇADO para "criar_lead" e gera o objeto "consent" completo. Nunca mais pula para "apresenta_ofertas".
   2. Mensagem de Espera (~1 min): Em "criar_lead", a Sofia obrigatoriamente envia a mensagem de espera de análise:
      "Perfeito! Sua solicitação já está em analise. ⏳ Avaliando em ~1 minuto... Assim que tivermos o retorno, chamaremos aqui com o resultado!"
   3. Blindagem de Simulação sem ID: "solicitar_simulacao" NUNCA é acionado se "loan_request_id" for ausente/nulo,
      evitando o erro 404 Not Found na API Fiserv. Se não houver lead ativo, direciona para "criar_lead" ou "consentimento_optin".
   4. Correção do Loop / Tom Humanizado: Substitui a detecção de 1ª repetição por contador cumulativo (>= 2 consecutivas)
      e remove a mensagem agressiva ("Vejo que estamos repetindo a mesma orientação..."), usando tom cortês e prestativo.
   5. Orientação Inteligente de Valores em coleta_valor (ex: se digitar "0 mil", orienta sobre o valor mínimo de R$ 10.000 sem travar).
   6. Preserva 100% dos FAQs completos, regras de estilo, parsing blindado de parcelas e reset de simulação da V26. */


// 📄 Configuração do Termo de Autorização - Fiserv (opt-in)
const FISERV_TERM_PDF_URL = "https://agentes.davosconsulting.com.br/termo-autorizacao-fiserv-v1-2026-06.pdf";
const FISERV_TERM_VERSION = "v1-2026-06";
const FISERV_TERM_HASH = "b919e74d1075bbd1c44fcef663f7e691932d5eb1fe1e54f8b30a3032c2b30d8b";

try {
    const rpcData = $node["RPC - Acesso Entrada"].json;
    const ctx = rpcData.context || {};

    // 🛡️ PROTEÇÃO DE HANDOFF (HITL)
    if (ctx.status === 'human_active') {
        return {
            currentStep: "stop_flow",
            stop_flow: true,
            reason: "Handoff Ativo: Operador humano está no controle.",
            conversation_id: rpcData.conversation?.id || rpcData.p_conversation_id,
            p_conversation_id: rpcData.conversation?.id || rpcData.p_conversation_id
        };
    }

    const leadInfo = ctx.lead_info || {};
    const agent = ctx.agent || {};
    const blueprint = agent.workflow_blueprint || { steps: {} };
    const history = ctx.messages_history || [];

    const currentMsg = String(
        $node["Edit Fields"]?.json?.message ??
        $node["Edit Fields"]?.first?.()?.json?.message ??
        $json?.content ??
        $json?.text ??
        $json?.message ??
        $json?.body ??
        rpcData?.message ??
        rpcData?.payload?.content ??
        ctx?.current_message ??
        (history.length > 0 && ['user', 'inbound', 'customer', 'cliente'].includes(String(history[history.length - 1]?.sender_type || history[history.length - 1]?.role || '').toLowerCase()) ? history[history.length - 1]?.content : "") ??
        ""
    ).trim();
    const lastUserLower = currentMsg.toLowerCase();

    // 🕒 REGRA DE AUDITORIA: VALIDAÇÃO DE OPT-IN PRÉVIO DENTRO DA JANELA DE 30 DIAS
    const consentTimestamp = leadInfo.consent?.opt_in_timestamp || leadInfo.consent?.timestamp || leadInfo.fiserv_requested_at || leadInfo.opt_in_timestamp;
    let isOptInWithin30Days = false;

    if (leadInfo.opt_in === true || leadInfo.optin === true || leadInfo.consent?.opt_in === true || leadInfo.loan_request_id || leadInfo.fiserv_loan_request_id) {
        if (consentTimestamp) {
            const consentAgeMs = Date.now() - new Date(consentTimestamp).getTime();
            const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
            isOptInWithin30Days = !isNaN(consentAgeMs) && consentAgeMs >= 0 && consentAgeMs <= thirtyDaysMs;
        } else {
            // Se possui opt-in ou ID registrado no banco mas o timestamp estava nulo, considera válido por segurança
            isOptInWithin30Days = Boolean(leadInfo.opt_in || leadInfo.consent?.opt_in || leadInfo.loan_request_id);
        }
    }

    // 🛡️ RECONHECIMENTO DE RECUSA DE CRÉDITO NO COMITÊ FISERV
    const isDeniedFiserv = Boolean(
        leadInfo.fiserv_status === 'denied' ||
        leadInfo.status === 'denied' ||
        leadInfo.formalization_status === 'lost' ||
        String(leadInfo.fiserv_external_status || '').toLowerCase().includes('não conseguimos') ||
        String(leadInfo.fiserv_external_status || '').toLowerCase().includes('reprovado') ||
        String(leadInfo.fiserv_external_status || '').toLowerCase().includes('cancelado')
    );

    // 🌟 RECONHECIMENTO DE JORNADA PRÉ-APROVADA (OPT-IN EXTERNO & CRÉDITO APROVADO)
    const isPreApprovedJourney = Boolean(
        leadInfo.journey_type === 'pre_approved' ||
        ctx.journey_type === 'pre_approved' ||
        rpcData.p_metadata?.journey_type === 'pre_approved' ||
        leadInfo.campaign_type === 'pre_approved' ||
        ctx.campaign_type === 'pre_approved' ||
        rpcData.p_metadata?.campaign_type === 'pre_approved'
    );

    if (isPreApprovedJourney && !isDeniedFiserv) {
        isOptInWithin30Days = true;
        leadInfo.opt_in = true;
        leadInfo.identity_confirmed = true;
        leadInfo.cnpj_confirmed = true;
        if (!leadInfo.requested_amount) leadInfo.requested_amount = 50000;
        if (!leadInfo.revenue) leadInfo.revenue = 80000;
    }

    const hasPriorOptIn = (isOptInWithin30Days || isPreApprovedJourney) && !isDeniedFiserv;
    const hasActiveLoan = Boolean((leadInfo.loan_request_id || leadInfo.fiserv_loan_request_id) && !isDeniedFiserv);
    const isApprovedFiserv = Boolean((isPreApprovedJourney || leadInfo.fiserv_is_approved || leadInfo.fiserv_status === 'comite_approved' || leadInfo.fiserv_status === 'approved' || leadInfo.fiserv_external_status === 'Pré-aprovado' || leadInfo.fiserv_external_status === 'Aprovado') && !isDeniedFiserv);

    // =========================================================================
    // 🛡️ CIRCUIT BREAKER ANTI-LOOP TRIPLO & DETECTOR DE AUTO-RESPOSTAS (UNIVERSAL)
    // =========================================================================

    // 1. Assinaturas Semânticas de Auto-Respostas, Cardápios, Horários e Robôs
    const regexAutoReply = /(agradece seu contato|como podemos ajudar|como posso te ajudar|não est(ou|amos) (dispon[ií]ve|atendendo)|não estamos funcionando|não está funcionando|não est(ou|amos) operando|funcionamos de .* [aà]s?|fora de hor[aá]rio|hor[aá]rio de atendimento|horário de funcionamento|hor[aá]rio comercial|estamos fechados|fechado no momento|faça seu pedido|faca seu pedido|nosso card[aá]pio|card[aá]pio digital|acesse nosso cat[aá]logo|atendente foi solicitado|atendimento feito por pessoas|responderemos assim que poss[ií]vel|em breve retornaremos|retornaremos em breve|retornaremos assim que|retornaremos o contato|expediente foi encerrado|hora marcada|pedidos pelo whatsapp|para realizar seu pedido|para agilizar (o|seu) atendimento|agilizar o seu atendimento|endere[cç]o de entrega|AutoResponder|prezado(a)? cliente|voc[eê] est[aá] n[ao]|voc[eê] talvez busque|ordem de chegada|cobramos taxa|seja bem-vindo|bem-vindo(a)? [aà]|obrigad[ao] pelo contato|obrigad[ao] pela compreens[aã]o|conheça nossas m[ií]dias|mensagem autom[aá]tica|resposta autom[aá]tica|atendimento autom[aá]tico|este canal [eé] exclusivo|este n[uú]mero (não recebe|não aceita) ligaç|🤖|[rR]ob[oô]|l[ií]v[iI]a|deeliv\.app|anota\.ai|ola\.click|cardapioweb|cardapio\.menu|instadelivery|hubt\.com|goomer)/i;

    const isButtonTemplateClick = ['quero simular!', 'quero simular', 'falar com um agente!', 'falar com um agente', 'simular'].includes(lastUserLower);

    // 2. Normalizador de Texto para Detecção Algorítmica de Repetição / Eco
    function normalizeForComparison(t) {
        if (!t) return "";
        return String(t)
            .toLowerCase()
            .replace(/[*_~`]/g, "")
            .replace(/[^\w\sáéíóúâêîôûãõç]/gi, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    const currentNormalized = normalizeForComparison(currentMsg);

    // 3. Inspeção do Histórico Recente (Eco, Repetição e Rajada)
    let isIdenticalUserRepeated = false;
    let isEchoPingPong = false;
    let isHighFrequencyBurst = false;
    let repeatCount = 0;

    const userMsgs = history.filter(m => ['user', 'inbound', 'customer', 'cliente'].includes(String(m.sender_type || m.role || m.sender || m.direction || '').toLowerCase()));
    const botMsgs = history.filter(m => ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || m.role || m.sender || m.direction || '').toLowerCase()));

    // Detecção 3A: Cliente enviou exatamente o mesmo texto consecutivo (ex: 2+ vezes seguidas)
    if (currentNormalized.length > 5 && userMsgs.length >= 2) {
        const prevUserNormalized = normalizeForComparison(userMsgs[userMsgs.length - 2]?.content || userMsgs[userMsgs.length - 2]?.text);
        if (currentNormalized === prevUserNormalized) {
            repeatCount++;
            if (userMsgs.length >= 3) {
                const prev2UserNormalized = normalizeForComparison(userMsgs[userMsgs.length - 3]?.content || userMsgs[userMsgs.length - 3]?.text);
                if (currentNormalized === prev2UserNormalized) repeatCount++;
            }
        }
        if (repeatCount >= 1) {
            isIdenticalUserRepeated = true;
        }
    }

    // Detecção 3B: Eco / Ping-Pong (Cliente ecoou o que o robô mandou ou o robô ecoou o cliente)
    if (currentNormalized.length > 8 && botMsgs.length > 0) {
        const lastBotNormalized = normalizeForComparison(botMsgs[botMsgs.length - 1]?.content || botMsgs[botMsgs.length - 1]?.text);
        if (currentNormalized === lastBotNormalized || (lastBotNormalized.length > 15 && lastBotNormalized.includes(currentNormalized)) || (currentNormalized.length > 15 && currentNormalized.includes(lastBotNormalized))) {
            isEchoPingPong = true;
        }
    }

    // Detecção 3C: Frequência Acelerada em Janela Curta (Burst de robôs)
    if (history.length >= 4) {
        const recentSlice = history.slice(-6);
        const firstTime = new Date(recentSlice[0].created_at || Date.now()).getTime();
        const lastTime = new Date(recentSlice[recentSlice.length - 1].created_at || Date.now()).getTime();
        const timeDiffSec = (lastTime - firstTime) / 1000;
        if (timeDiffSec > 0 && timeDiffSec < 180 && (repeatCount > 0 || isEchoPingPong)) {
            isHighFrequencyBurst = true;
        }
    }

    const isAutoReplyDetected = !isButtonTemplateClick && !hasPriorOptIn && !hasActiveLoan && !leadInfo.revenue && !leadInfo.faturamento && regexAutoReply.test(lastUserLower);
    const isCircuitBreakerTriggered = !isButtonTemplateClick && (isIdenticalUserRepeated || isEchoPingPong || isHighFrequencyBurst);

    if (isAutoReplyDetected || isCircuitBreakerTriggered) {
        const stopReason = isAutoReplyDetected
            ? "Auto-resposta detectada: mensagem de ausência, cardápio ou robô do WhatsApp Business recebida. Fluxo pausado aguardando interação humana."
            : `Circuit Breaker Anti-Loop ativado: padrão repetitivo detectado (repetição: ${repeatCount}, eco: ${isEchoPingPong}, rajada: ${isHighFrequencyBurst}). Fluxo interrompido com segurança.`;

        return {
            currentStep: "stop_flow",
            stop_flow: true,
            is_auto_reply: true,
            circuit_breaker: true,
            reason: stopReason,
            conversation_id: rpcData.conversation?.id || rpcData.p_conversation_id,
            p_conversation_id: rpcData.conversation?.id || rpcData.p_conversation_id
            // 🛡️ Não trava em human_active para preservar a revalidação de 30 dias do lead
        };
    }

    // 🛡️ SANITIZAÇÃO GLOBAL OBRIGATÓRIA: NUNCA ENVIAR CAMPOS OU DADOS TÉCNICOS AO CLIENTE
    function sanitizeUserFacingMessage(text) {
        if (!text) return "";
        let clean = String(text);

        clean = clean.replace(/loan request is not eligible for simulation/gi, 'A proposta não está disponível para cálculo de simulação no momento');
        clean = clean.replace(/\b(loan_request_id|loan request|simulation_data|http_status|error_code|detail|status_code)\b/gi, '');
        clean = clean.replace(/not eligible/gi, 'não elegível');
        clean = clean.replace(/internal server error|failed to fetch/gi, 'Instabilidade temporária no serviço');
        clean = clean.replace(/\b(undefined|null|NaN)\b/g, '');

        return clean.replace(/[ \t]+/g, ' ').trim();
    }

    // 🛡️ MÁSCARA DE CNPJ: MANTÉM OS 9 ÚLTIMOS DÍGITOS VISÍVEIS (ex: **.***.678/0001-90)
    function formatCnpjMasked(rawCnpj) {
        if (!rawCnpj) return "";
        const clean = String(rawCnpj).replace(/\D/g, "");
        if (clean.length !== 14) return String(rawCnpj);
        return `**.***.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
    }

    // --- 🛠️ FUNÇÕES AUXILIARES DE PARSING (V26 BLINDADA) ---
    function parseNumber(text) {
        if (!text) return null;
        let clean = text.toLowerCase().trim();

        const milMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*(?:mil|k)\b/i);
        if (milMatch) {
            let numStr = milMatch[1].replace(/\./g, '').replace(',', '.');
            let val = parseFloat(numStr);
            if (!isNaN(val)) return val * 1000;
        }

        clean = clean.replace(/\bem\s+\d+(?:\s*(?:x|vezes|parcelas?))?\b/gi, '').trim();
        clean = clean.replace(/\b\d+\s*(?:x|vezes|parcelas?)\b/gi, '').trim();

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
        for (let i = hist.length - 2; i >= 0; i--) {
            const msg = hist[i];
            const isBot = ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(msg.sender_type || msg.role || msg.sender || msg.direction).toLowerCase());
            if (isBot) {
                const content = String(msg.content || msg.text || "").toLowerCase();
                const matchesQuestion = questionSubstrings.some(sub => content.includes(sub));
                if (matchesQuestion) {
                    for (let j = i + 1; j < hist.length; j++) {
                        const userMsg = hist[j];
                        const nextIsBot = ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(userMsg.sender_type || userMsg.role || userMsg.sender || userMsg.direction).toLowerCase());
                        if (nextIsBot) break;
                        const parsed = parseNumber(userMsg.content || userMsg.text || "");
                        if (parsed !== null && parsed > 0) return parsed;
                    }
                }
            }
        }
        return null;
    }

    // --- 0) LEITURA DO ROTEADOR SEMÂNTICO (LLM PRÉVIA) ---
    let semanticIntent = "OTHER";
    let semanticReasoning = "";
    let semanticFunnelStep = null;
    let semanticAmount = null;
    let semanticRevenue = null;
    let semanticInstallments = null;
    let llmParseError = null;

    try {
        let textData = null;
        const possibleNodeNames = ['Message Intencao', 'Message a model1', 'Message a model2', 'Message a model', 'LLM Intenção', 'Classificador', 'OpenAI', 'Anthropic', 'Basic LLM Chain'];

        for (let name of possibleNodeNames) {
            try {
                const nodeData = $(name).first()?.json;
                if (nodeData) {
                    textData = nodeData.output?.[0]?.content?.[0]?.text || nodeData.text || nodeData.message?.content || nodeData.output;
                    if (textData) break;
                }
            } catch (e) { }
        }

        if (textData) {
            if (typeof textData === 'object') {
                semanticIntent = textData.strategy || textData.intent || "OTHER";
                semanticReasoning = textData.reasoning || "";
                semanticFunnelStep = textData.current_funnel_step || null;
                semanticAmount = textData.extracted_amount || null;
                semanticRevenue = textData.extracted_revenue || null;
                semanticInstallments = textData.extracted_installments || null;
            } else if (typeof textData === 'string') {
                const startIdx = textData.indexOf('{');
                const endIdx = textData.lastIndexOf('}');
                if (startIdx >= 0 && endIdx >= 0) {
                    const parsed = JSON.parse(textData.substring(startIdx, endIdx + 1));
                    semanticIntent = parsed.strategy || parsed.intent || "OTHER";
                    semanticReasoning = parsed.reasoning || "";
                    semanticFunnelStep = parsed.current_funnel_step || null;
                    semanticAmount = parsed.extracted_amount || null;
                    semanticRevenue = parsed.extracted_revenue || null;
                    semanticInstallments = parsed.extracted_installments || null;
                }
            }
        }
    } catch (e) {
        llmParseError = e.message;
    }

    // 🔄 DETECÇÃO CRÍTICA DE REINÍCIO DE SIMULAÇÃO
    const isRestartSimulation = /\b(nova simula[çc][ãa]o|outra simula[çc][ãa]o|recome[çc]ar|simular de novo)\b/i.test(lastUserLower) || lastUserLower.includes("nova simulação");

    if (isRestartSimulation) {
        semanticAmount = null;
        semanticInstallments = null;
    }

    // --- 1) HISTÓRICO E DETECÇÃO DE ESTADO ---
    const assistantMessages = history.filter(m =>
        ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || m.role || m.sender || m.direction).toLowerCase())
    );

    const lastSofiaMsg = String(assistantMessages[assistantMessages.length - 1]?.content || assistantMessages[assistantMessages.length - 1]?.text || "").toLowerCase().replace(/\*/g, '');
    const secondLastSofiaMsg = String(assistantMessages[assistantMessages.length - 2]?.content || assistantMessages[assistantMessages.length - 2]?.text || "").toLowerCase().replace(/\*/g, '');
    const historyTexts = history.map(m => String(m.content || m.text || "").toLowerCase().replace(/\*/g, '')).join(" ");

    const linkAlreadySent = historyTexts.includes("clicar no link abaixo") || historyTexts.includes("fiservcapital.moneymoneyinvest");

    // 🛡️ Detecção de simulação prévia e confirmação de identidade no histórico
    const hasSimulatedInHistory = Boolean(
        historyTexts.includes("simulação concluída") || 
        historyTexts.includes("simulacao concluida") || 
        historyTexts.includes("valor solicitado: r$") ||
        historyTexts.includes("podemos seguir nessas condições") ||
        historyTexts.includes("podemos seguir nessas condicoes") ||
        leadInfo.simulation_data || 
        (leadInfo.requested_amount && leadInfo.requested_installments)
    );

    const isIdentityConfirmedPrior = Boolean(
        leadInfo.identity_confirmed ||
        leadInfo.cnpj_confirmed ||
        historyTexts.includes("responsável pelo cnpj") ||
        historyTexts.includes("responsavel pelo cnpj") ||
        historyTexts.includes("estou falando com o responsável") ||
        historyTexts.includes("estou falando com o responsavel") ||
        Boolean(leadInfo.revenue && leadInfo.revenue > 0) ||
        Boolean(leadInfo.requested_amount && leadInfo.requested_amount > 0) ||
        hasPriorOptIn ||
        hasActiveLoan ||
        hasSimulatedInHistory
    );

    let currentStep = semanticFunnelStep || 'start';

    // 🔴 OVERRIDE DEFENSIVO
    if (!semanticFunnelStep || semanticFunnelStep === 'start' || semanticFunnelStep === 'explicacao_agente') {
        if (lastSofiaMsg.includes("digite ok para continuar") || lastSofiaMsg.includes("ok, entendi") || lastSofiaMsg.includes("clique no botão abaixo para prosseguir") || lastSofiaMsg.includes("clique no botao abaixo para prosseguir")) {
            currentStep = 'reforco_condicoes';
        } else if (
            lastSofiaMsg.includes("confirma que deseja prosseguir") || 
            lastSofiaMsg.includes("formalização") || 
            lastSofiaMsg.includes("formalizacao") || 
            lastSofiaMsg.includes("podemos seguir com a formalização") ||
            lastSofiaMsg.includes("podemos seguir com a formalizacao") ||
            lastSofiaMsg.includes("podemos seguir nessas condições") ||
            lastSofiaMsg.includes("podemos seguir nessas condicoes") ||
            lastSofiaMsg.includes("podemos seguir com a simulação") ||
            lastSofiaMsg.includes("podemos seguir com a simulacao") ||
            lastSofiaMsg.includes("condições informadas anteriormente") ||
            lastSofiaMsg.includes("condicoes informadas anteriormente") ||
            lastSofiaMsg.includes("seguir com a contratação") ||
            lastSofiaMsg.includes("seguir com a contratacao") ||
            lastSofiaMsg.includes("simulação concluída") ||
            lastSofiaMsg.includes("simulacao concluida") ||
            (hasSimulatedInHistory && (
                lastSofiaMsg.includes("podemos seguir") || 
                lastSofiaMsg.includes("condições") || 
                lastSofiaMsg.includes("condicoes") ||
                lastSofiaMsg.includes("seguir com") ||
                secondLastSofiaMsg.includes("simulação concluída") ||
                secondLastSofiaMsg.includes("simulacao concluida") ||
                secondLastSofiaMsg.includes("podemos seguir")
            ))
        ) {
            currentStep = 'confirmacao_cliente';
        } else if (lastSofiaMsg.includes("confirmada com sucesso") || lastSofiaMsg.includes("assessores humanos")) {
            currentStep = 'finalizacao_sucesso';
        } else if (lastSofiaMsg.includes("não conseguimos liberar") || lastSofiaMsg.includes("oferta pré-aprovada de crédito") || lastSofiaMsg.includes("políticas internas de crédito") || lastSofiaMsg.includes("politicas internas de credito")) {
            currentStep = 'recusa_analise';
        } else if (lastSofiaMsg.includes("enviei suas informações para a fiserv") || lastSofiaMsg.includes("análise e geração das ofertas") || lastSofiaMsg.includes("aguarde que eu já te chamo") || lastSofiaMsg.includes("comitê fiserv") || lastSofiaMsg.includes("avaliando em ~1 minuto") || lastSofiaMsg.includes("te chamará aqui com o resultado") || lastSofiaMsg.includes("aguarde um momento")) {
            currentStep = 'aguardando_fiserv';
        } else if (
            lastSofiaMsg.includes("opções de crédito") ||
            lastSofiaMsg.includes("quantidade de parcelas") ||
            lastSofiaMsg.includes("quantas parcelas gostaria de simular") ||
            lastSofiaMsg.includes("em quantas parcelas") ||
            lastSofiaMsg.includes("quantas parcelas deseja pagar") ||
            lastSofiaMsg.includes("informe o valor que você gostaria de simular") ||
            lastSofiaMsg.includes("valor que você gostaria de simular") ||
            lastSofiaMsg.includes("vamos fazer uma nova simulação")
        ) {
            currentStep = 'apresenta_ofertas';
        } else if (
            lastSofiaMsg.includes("faturamento médio mensal atual") || 
            lastSofiaMsg.includes("faturamento médio mensal da sua empresa") || 
            lastSofiaMsg.includes("qual o faturamento") ||
            lastSofiaMsg.includes("qual o faturamento médio mensal") ||
            lastSofiaMsg.includes("faturamento médio mensal aproximado") ||
            (lastSofiaMsg.includes("avaliarmos a melhor proposta") && lastSofiaMsg.includes("faturamento"))
        ) {
            currentStep = 'coleta_faturamento';
        } else if (lastSofiaMsg.includes("valor aproximado você gostaria de solicitar") || lastSofiaMsg.includes("valor aproximado voce gostaria de solicitar") || lastSofiaMsg.includes("qual valor você tem em mente") || lastSofiaMsg.includes("qual valor voce tem em mente") || lastSofiaMsg.includes("valor você tem em mente") || lastSofiaMsg.includes("valor de empréstimo") || lastSofiaMsg.includes("valor mínimo para solicitação") || lastSofiaMsg.includes("valor máximo disponível")) {
            currentStep = 'coleta_valor';
        } else if (
            lastSofiaMsg.includes("autorização à fiserv") ||
            lastSofiaMsg.includes("termo de autorização") ||
            lastSofiaMsg.includes("termos de autorização") ||
            lastSofiaMsg.includes("li e entendi") ||
            lastSofiaMsg.includes("autorizo o tratamento de meus dados") ||
            lastSofiaMsg.includes("scr/bacen") ||
            lastSofiaMsg.includes("entidades registradoras") ||
            secondLastSofiaMsg.includes("li e entendi") ||
            secondLastSofiaMsg.includes("termos de autorização") ||
            secondLastSofiaMsg.includes("termo de autorização") ||
            lastSofiaMsg.includes("autoriza a realização das consultas") ||
            lastSofiaMsg.includes("autoriza a realização dessas consultas") ||
            lastSofiaMsg.includes("autoriza a realização") ||
            lastSofiaMsg.includes("conforme a lgpd") ||
            lastSofiaMsg.includes("consultar seus recebíveis e informações de crédito") ||
            lastSofiaMsg.includes("contamos com a fiserv, nossa parceira")
        ) {
            currentStep = 'consentimento_optin';
        } else if (lastSofiaMsg.includes("cnpj") && (lastSofiaMsg.includes("responsavel") || lastSofiaMsg.includes("responsável") || lastSofiaMsg.includes("confirmar") || lastSofiaMsg.includes("informacao") || lastSofiaMsg.includes("informação")) && !lastSofiaMsg.includes("faturamento")) {
            currentStep = 'verificacao_cnpj';
        } else if (lastSofiaMsg.includes("cnpj correto") || lastSofiaMsg.includes("solicitar a inclusão")) {
            currentStep = 'coleta_cnpj_correto';
        } else if (lastSofiaMsg.includes("nome do estabelecimento")) {
            currentStep = 'coleta_nome_estabelecimento';
        } else if (!semanticFunnelStep && assistantMessages.length > 0) {
            currentStep = 'explicacao_agente';
        }
    }

    let revenue = semanticRevenue || findValueForQuestion(history, ["faturamento médio mensal", "faturamento medio mensal"]);
    if (isPreApprovedJourney && (!revenue || revenue <= 0)) {
        revenue = leadInfo.revenue || 80000;
    }

    // EXTRAÇÃO INTELIGENTE DE VALORES E PARCELAS (V26)
    let fallbackNumber = parseNumber(lastUserLower);

    if (currentStep === 'coleta_faturamento') {
        semanticAmount = null;
    }

    let extractedAmount = isRestartSimulation ? null : (semanticAmount || findValueForQuestion(history, ["valor de empréstimo", "valor de emprestimo", "deseja simular", "valor aproximado você gostaria de solicitar", "valor aproximado voce gostaria de solicitar", "valor que você gostaria de simular", "valor que voce gostaria de simular"]));
    let extractedInstallments = isRestartSimulation ? null : (semanticInstallments || findValueForQuestion(history, ["quantidade de parcelas", "em quantas parcelas", "prazo de pagamento", "quantas parcelas"]));

    if (!isRestartSimulation) {
        if (!extractedAmount) {
            const mAmount = historyTexts.match(/valor solicitado:\s*r\$\s*([\d\.,]+)/i);
            if (mAmount) extractedAmount = parseNumber(mAmount[1]);
        }
        if (!extractedInstallments) {
            const mInst = historyTexts.match(/prazo:\s*(\d{1,2})\s*parcelas/i);
            if (mInst) extractedInstallments = parseInt(mInst[1], 10);
        }
    }

    if (extractedInstallments > 48) {
        if (!extractedAmount) extractedAmount = extractedInstallments;
        extractedInstallments = null;
    }
    if (extractedAmount > 0 && extractedAmount <= 48 && !extractedInstallments) {
        extractedInstallments = extractedAmount;
        extractedAmount = null;
    }

    // ⚡ Prioridade da mensagem atual
    if (currentStep === 'coleta_faturamento') {
        if (fallbackNumber !== null && fallbackNumber >= 1000) {
            revenue = fallbackNumber;
        } else if (!revenue && fallbackNumber > 100) {
            revenue = fallbackNumber;
        } else if (!revenue && fallbackNumber >= 5 && fallbackNumber <= 500) {
            revenue = fallbackNumber * 1000; // Ex: "70" -> 70.000
        }
    } else if (currentStep === 'coleta_valor' || currentStep === 'valor_proposta') {
        if (fallbackNumber !== null && fallbackNumber >= 1000) {
            extractedAmount = fallbackNumber;
        } else if (!extractedAmount && fallbackNumber > 100) {
            extractedAmount = fallbackNumber;
        } else if (!extractedAmount && fallbackNumber >= 10 && fallbackNumber <= 500) {
            extractedAmount = fallbackNumber * 1000; // Ex: "50" -> 50.000
        }
    } else {
        if (!extractedAmount && fallbackNumber > 100) {
            extractedAmount = fallbackNumber;
        } else if (!extractedAmount && fallbackNumber >= 10 && fallbackNumber <= 500 && !lastUserLower.match(/(?:x|vezes|parcelas)\b/i)) {
            extractedAmount = fallbackNumber * 1000; // Ex: "50" -> 50.000
        }
    }

    if (!extractedInstallments) {
        let match = lastUserLower.match(/(?:em\s+)?(\d{1,2})\s*(?:x|vezes|parcelas)\b/i) || lastUserLower.match(/\bem\s+(\d{1,2})\b/i);
        if (match) {
            let inst = parseInt(match[1]);
            if (inst >= 1 && inst <= 48) {
                extractedInstallments = inst;
            }
        }
    }

    if (!extractedInstallments && fallbackNumber > 0 && fallbackNumber <= 48) {
        extractedInstallments = fallbackNumber;
    }

    let requested_amount = isRestartSimulation ? null : (extractedAmount || leadInfo.requested_amount);
    let requested_installments = isRestartSimulation ? null : (extractedInstallments || leadInfo.requested_installments);
    if (requested_installments > 48) {
        requested_installments = null;
    }
    if (requested_amount && requested_amount < 1000) requested_amount = null;
    if (isPreApprovedJourney && (!requested_amount || requested_amount < 1000)) {
        requested_amount = leadInfo.requested_amount || 50000;
    }

    // --- 2) INTENÇÕES (REGEX + SEMÂNTICA HÍBRIDA) ---
    const isAgentButtonClick = /^falar com um agente!?$/i.test(lastUserLower);

    const isSelfSimulationRequest =
        /\b(simular?|simula[çc][ãa]o)\b/i.test(lastUserLower) &&
        /\b(vc|voc[eê]|tu|pra mim|por mim|para mim|me faz|poderia|consegue|conseguiria|faz(er)? (para |pra |por )?mim|faz (voc[eê]|vc))(?![a-z0-9])/i.test(lastUserLower);

    const isLinkRequest = !isSelfSimulationRequest && !isRestartSimulation && (
        /\b(simular|simula[çc][ãa]o)\b/i.test(lastUserLower) ||
        (/\b(quero|manda|mande|envia|passa|passe|pode|me d[áa]|mandar)\b/i.test(lastUserLower) && /\b(link|simul|proposta|an[áa]lise)\b/i.test(lastUserLower)) ||
        (/^link$/i.test(lastUserLower)) ||
        semanticIntent === "SIMULATION_REQUEST"
    );

    const isOptInAccepted = (
        (/\b(autorizo|sim,?\s*autorizo|sim|concordo|aceito|de acordo|ok)\b/i.test(lastUserLower) && !/\b(n[ãa]o)\b/i.test(lastUserLower)) &&
        (currentStep === 'consentimento_optin' || semanticIntent === "OPTIN_ACCEPTED" || lastUserLower.includes("autorizo") || currentStep === 'start' || currentStep === 'explicacao_agente' || currentStep === 'coleta_valor')
    ) || semanticIntent === "OPTIN_ACCEPTED" || lastUserLower.includes("sim, autorizo") || lastUserLower.includes("sim autorizo") || lastUserLower.includes("optin_sim") || (currentStep === 'consentimento_optin' && /^(ok|sim|autorizo|positivo|de acordo|concordo|aceito)$/i.test(lastUserLower.trim()));

    const isAffirmative = ((/\b(s[ií]+m+|pode|manda|mande|envia|bora|aceito|ok|beleza|correto|confirm[ao]|show|com certeza|isso|exato|exatamente|claro|positivo|verdade|de acordo|fechou|ok, entendi|entendi)\b/i.test(lastUserLower) || isLinkRequest) && !/\b(n[ãa]o|como|como assim)\b/i.test(lastUserLower) || ["VERIFY_IDENTITY"].includes(semanticIntent)) && !isRestartSimulation;
    const isNegative = /\b(não|nao|negativo|parar|cancelar|não quero|nem pensar|jamais|agora não|agora nao|deixa pra depois|sem interesse|não tenho interesse|nao tenho interesse|não preciso|nao preciso|desisto|não vou querer|nao vou querer)\b/i.test(lastUserLower) || semanticIntent === "WAIT_AND_RETURN";

    // Reconhecimento de divergência de CNPJ no input do usuário
    const isCnpjDivergent = /\b(n[aã]o [eé] (meu|minha|esse|este)|cnpj (errado|n[aã]o [eé]|outro|diferente|incorreto)|n[aã]o sou|outra empresa|trocou|empresa errada|n[aã]o perten[cç]o)\b/i.test(lastUserLower) || semanticIntent === "CNPJ_BLOCKED";

    const regexDoubt = /\b(dúvida|duvida|como|como assim|como funciona|saber mais|explica|entender|oque é|o que é|golpe|seguro|fraude|confiável|taxa|juros|bmp|banco|garantia|prazo|boleto|cartão|cartao|cartões|cartoes|faturamento|só no cartão|so no cartao|crédito|credito|débito|debito|falar com um agente|porque|objetivo|garantias|quem é você|quem e voce|você é bot|voce e bot|é um robô|e um robo|portal|senha|login|cadastrais|cadastro|maquininha|filiação|filiaca|endereço|endereco|cnae|pat|dirf|rendimentos|assistência|assistencia|chaveiro|eletricista|encanador|reembolso|corte|antecipação|antecipacao|contrato|anuidade|tarifa|adesão|adesao|mensalidade)\b/i.test(lastUserLower) || /^cart[aã]o\??$/i.test(lastUserLower.trim());
    const isDoubt = regexDoubt || ["EXACT_FAQ", "DYNAMIC_FAQ", "INSTITUTIONAL_FAQ", "DOUBT"].includes(semanticIntent);

    const regexHuman = /\b(atendimento|falar com|conversar com|passar para|chamar|quero|preciso)\b.*\b(humano|persona|atendente|vendedor|algu[ée]m|especialista|assessor|fone|telefone|ligar|ligação)\b/i.test(lastUserLower) || /^(atendente|assessor|humano|pessoa|fone|telefone)$/i.test(lastUserLower);
    const isHumanRequest = (regexHuman || semanticIntent === "HUMAN_HANDOFF" || isCnpjDivergent) && !isAgentButtonClick;

    const isFarewell = /\b(obrigado|obrigada|vlw|valeu|entendido|entendi|tchau|at[ée] logo|por enquanto [ée] s[óo]|nada mais|encerrar|show)\b/i.test(lastUserLower);
    const isGreeting = /^(oi|ol[aá]|bom dia|boa tarde|boa noite|oie|opa)$/i.test(lastUserLower);

    const regexComplaint = (/\b(atraso|problema|errado|reclamação|ruim|péssimo|horrível|lixo|merda|falha|não funciona|nao funciona|está ruim|está péssimo)\b/i.test(lastUserLower) || (/\b(n[ãa]o recebi|nao recebi)\b/i.test(lastUserLower) && !/reembolso/i.test(lastUserLower)));
    const isComplaint = regexComplaint || semanticIntent === "COMPLAINT" || semanticIntent === "COMPLAINT_RECOVERY";

    const checkIfComplaint = (msgText) => {
        const textLower = String(msgText || "").toLowerCase();
        return (/\b(atraso|problema|errado|reclamação|ruim|péssimo|horrível|lixo|merda|falha|não funciona|nao funciona|está ruim|está péssimo)\b/i.test(textLower) || (/\b(n[ãa]o recebi|nao recebi)\b/i.test(textLower) && !/reembolso/i.test(textLower)));
    };

    const previousClientComplaints = history
        .filter(m => !['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || m.role || m.sender || m.direction).toLowerCase()))
        .filter(m => checkIfComplaint(m.content || m.text));

    const isFirstComplaint = previousClientComplaints.length === 0;
    const effectiveComplaint = isComplaint && !isFirstComplaint;

    // --- 3) GESTÃO DINÂMICA DE INCIDENTES ---
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

    // --- 4) TRANSIÇÕES DE ESTADO (V28: FUSÃO IDENTIDADE -> FATURAMENTO) ---
    let nextStep = currentStep;
    let transitionApplied = false;

    const userTypedNewNumbers = (fallbackNumber !== null && fallbackNumber > 0);

    if (isAgentButtonClick) {
        nextStep = 'explicacao_agente';
        transitionApplied = true;
    } else if (currentStep === 'start') {
        if (!isNegative && !isDoubt) {
            if (isPreApprovedJourney && leadInfo.pre_approved_amount) {
                nextStep = 'apresenta_ofertas';
            } else if (hasSimulatedInHistory) {
                nextStep = 'reforco_condicoes';
            } else if ((hasActiveLoan || isApprovedFiserv) && leadInfo.pre_approved_amount) {
                nextStep = 'apresenta_ofertas';
            } else if (hasPriorOptIn && leadInfo.pre_approved_amount) {
                nextStep = hasActiveLoan ? 'apresenta_ofertas' : 'criar_lead';
            } else if (revenue && revenue > 0) {
                nextStep = 'coleta_valor';
            } else {
                nextStep = 'coleta_faturamento';
            }
            transitionApplied = true;
        }
    } else if (currentStep === 'explicacao_agente') {
        if (isAffirmative && !isDoubt) {
            if (isPreApprovedJourney && leadInfo.pre_approved_amount) {
                nextStep = 'apresenta_ofertas';
            } else if (hasSimulatedInHistory) {
                nextStep = 'reforco_condicoes';
            } else if ((hasActiveLoan || isApprovedFiserv) && leadInfo.pre_approved_amount) {
                nextStep = 'apresenta_ofertas';
            } else if (hasPriorOptIn && leadInfo.pre_approved_amount) {
                nextStep = hasActiveLoan ? 'apresenta_ofertas' : 'criar_lead';
            } else if (revenue && revenue > 0) {
                nextStep = 'coleta_valor';
            } else {
                nextStep = 'coleta_faturamento';
            }
            transitionApplied = true;
        }
    } else if (currentStep === 'verificacao_cnpj') {
        // 🛡️ Retrocompatibilidade: Se cliente antigo respondeu à mensagem legada
        if (isAffirmative && !isDoubt) {
            if (leadInfo.is_lead) {
                const extStatus = leadInfo.fiserv_external_status || "";
                if (leadInfo.fiserv_status === 'comite_approved' || leadInfo.fiserv_status === 'formalization' || leadInfo.fiserv_status === 'won' || extStatus === 'Pré-aprovado' || extStatus === 'Aprovado' || extStatus === 'Proposta') {
                    nextStep = 'apresenta_ofertas';
                } else if (leadInfo.fiserv_status === 'in_progress' || leadInfo.fiserv_status === 'fail_to_contact' || leadInfo.fiserv_status === 'contact_updated' || leadInfo.fiserv_status === 'comite' || leadInfo.fiserv_status === 'in_quoting') {
                    nextStep = 'aguardando_fiserv';
                } else if (leadInfo.fiserv_status === 'denied' || leadInfo.fiserv_status === 'cancelled' || extStatus === 'Reprovado' || extStatus === 'Cancelado') {
                    nextStep = 'recusa_analise';
                } else {
                    nextStep = 'coleta_faturamento';
                }
            } else {
                nextStep = 'coleta_faturamento';
            }
            transitionApplied = true;
        } else if (isNegative && !isDoubt) {
            nextStep = 'coleta_cnpj_correto';
            transitionApplied = true;
        } else if (semanticIntent === "CNPJ_BLOCKED") {
            nextStep = 'coleta_cnpj_correto';
            transitionApplied = true;
        }
    } else if (currentStep === 'coleta_faturamento') {
        if (isCnpjDivergent) {
            nextStep = 'coleta_cnpj_correto';
            transitionApplied = true;
        } else if (revenue && revenue > 0 && !isDoubt) {
            nextStep = 'coleta_valor';
            transitionApplied = true;
        } else if (isNegative && !isDoubt) {
            nextStep = 'desistencia_cliente';
            transitionApplied = true;
        } else {
            nextStep = 'coleta_faturamento';
            transitionApplied = true;
        }
    } else if (currentStep === 'coleta_valor') {
        if (requested_amount && requested_amount >= 10000 && requested_amount <= 500000 && !isDoubt) {
            nextStep = hasPriorOptIn ? (hasActiveLoan ? 'apresenta_ofertas' : 'criar_lead') : 'consentimento_optin';
            transitionApplied = true;
        } else if (isNegative && !isDoubt) {
            nextStep = 'desistencia_cliente';
            transitionApplied = true;
        } else {
            nextStep = 'coleta_valor';
            transitionApplied = true;
        }
    } else if (currentStep === 'consentimento_optin' || (isOptInAccepted && !hasActiveLoan)) {
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
    } else if (currentStep === 'aguardando_fiserv') {
        if (isAffirmative && !isDoubt) {
            nextStep = 'apresenta_ofertas';
            transitionApplied = true;
        } else if (isNegative && !isDoubt) {
            nextStep = 'desistencia_cliente';
            transitionApplied = true;
        } else {
            nextStep = 'aguardando_fiserv';
            transitionApplied = true;
        }
    } else if (currentStep === 'apresenta_ofertas') {
        if (requested_installments && requested_amount && !isDoubt) {
            nextStep = 'solicitar_simulacao';
            transitionApplied = true;
        } else if (isNegative && !isDoubt) {
            nextStep = 'desistencia_cliente';
            transitionApplied = true;
        } else {
            nextStep = 'apresenta_ofertas';
        }
    } else if (currentStep === 'solicitar_simulacao' || currentStep === 'confirmacao_cliente') {
        const hasNewNumbers = userTypedNewNumbers;
        const asksForSimulation = /\b(simular|simula[çc][ãa]o|outr[oa]|mudar|alterar|recalcular|novamente|vezes|parcelas?)\b/i.test(lastUserLower);

        if (isRestartSimulation) {
            requested_amount = null;
            requested_installments = null;
            nextStep = 'apresenta_ofertas';
            transitionApplied = true;
        } else if (currentStep === 'confirmacao_cliente' && isAffirmative && !isDoubt && !asksForSimulation && !isRestartSimulation) {
            nextStep = 'reforco_condicoes';
            transitionApplied = true;
        } else if (hasNewNumbers || asksForSimulation) {
            if (requested_amount && requested_installments && hasNewNumbers) {
                nextStep = 'solicitar_simulacao';
                transitionApplied = true;
            } else {
                requested_amount = null;
                requested_installments = null;
                nextStep = 'apresenta_ofertas';
                transitionApplied = true;
            }
        } else if (isAffirmative && !isDoubt) {
            nextStep = 'reforco_condicoes';
            transitionApplied = true;
        } else if (isNegative && !isDoubt) {
            nextStep = 'apresenta_ofertas';
            transitionApplied = true;
        } else {
            nextStep = currentStep;
        }
    } else if (currentStep === 'reforco_condicoes') {
        if (isAffirmative && !isDoubt) {
            nextStep = 'finalizacao_sucesso';
            transitionApplied = true;
        } else if (isDoubt) {
            nextStep = 'reforco_condicoes';
        } else {
            nextStep = 'reforco_condicoes';
            transitionApplied = true;
        }
    }

    // 🛡️ BLINDAGEM ZERO: NUNCA PEDIR OPT-IN SE O CLIENTE JÁ DEU O ACEITE NOS ÚLTIMOS 30 DIAS
    if (nextStep === 'consentimento_optin' && hasPriorOptIn) {
        nextStep = hasActiveLoan ? 'apresenta_ofertas' : 'criar_lead';
        transitionApplied = true;
    }

    // 🛡️ BLINDAGEM ZERO-B: NUNCA REGREDIR PARA VERIFICACAO_CNPJ SE A IDENTIDADE JÁ FOI CONFIRMADA
    if (nextStep === 'verificacao_cnpj' && isIdentityConfirmedPrior) {
        if (isPreApprovedJourney) {
            nextStep = 'apresenta_ofertas';
        } else if (hasSimulatedInHistory) {
            nextStep = 'reforco_condicoes';
        } else if (hasActiveLoan || isApprovedFiserv) {
            nextStep = 'apresenta_ofertas';
        } else if (hasPriorOptIn) {
            nextStep = hasActiveLoan ? 'apresenta_ofertas' : 'criar_lead';
        } else if (revenue && revenue > 0) {
            nextStep = 'coleta_valor';
        } else {
            nextStep = 'coleta_faturamento';
        }
        transitionApplied = true;
    }

    // 🛡️ BLINDAGEM ZERO-C: SE JORNADA PRÉ-APROVADA, NUNCA REGREDIR PARA ETAPAS CADASTRAIS
    if (isPreApprovedJourney && ['verificacao_cnpj', 'coleta_cnpj_correto', 'coleta_faturamento', 'coleta_valor', 'consentimento_optin'].includes(nextStep)) {
        nextStep = 'apresenta_ofertas';
        transitionApplied = true;
    }

    // 🛡️ BLINDAGEM 1: CONTRA CRIAR LEAD DUPLICADO SE JÁ TEM EMPRÉSTIMO ATIVO
    if (hasActiveLoan && isApprovedFiserv && !isRestartSimulation) {
        if (nextStep === 'criar_lead' || nextStep === 'consentimento_optin' || nextStep === 'coleta_valor' || nextStep === 'coleta_faturamento') {
            if (requested_amount && requested_installments) {
                nextStep = 'solicitar_simulacao';
            } else {
                nextStep = 'apresenta_ofertas';
            }
            transitionApplied = true;
        }
    }

    // 🛡️ BLINDAGEM 2: CONTRA SIMULAÇÃO SEM LEAD CRIADO (EVITA 404 NOT FOUND NA FISERV)
    if (nextStep === 'solicitar_simulacao' && !hasActiveLoan) {
        if (isOptInAccepted || hasPriorOptIn || nextStep === 'criar_lead') {
            nextStep = 'criar_lead';
        } else if (requested_amount && requested_amount >= 10000) {
            nextStep = 'consentimento_optin';
        } else {
            nextStep = 'coleta_valor';
        }
        transitionApplied = true;
    }

    // 🛡️ BLINDAGEM 3: SE FOI DADO OPT-IN E NÃO TEM LEAD ATIVO, NUNCA PERMITIR APRESENTA_OFERTAS ANTES DE CRIAR LEAD (EXCETO SE PRÉ-APROVADO EXTERNO)
    if (!isPreApprovedJourney && nextStep === 'apresenta_ofertas' && !hasActiveLoan && (isOptInAccepted || hasPriorOptIn || lastUserLower.includes("autorizo"))) {
        nextStep = 'criar_lead';
        transitionApplied = true;
    }

    // 🛡️ BLINDAGEM 4: CLIENTE RECUSADO NO CRÉDITO NUNCA MAIS AVANÇA PARA SIMULAÇÃO OU APRESENTAÇÃO DE OFERTAS
    if (isDeniedFiserv) {
        nextStep = 'recusa_analise';
        transitionApplied = true;
    }

    // --- 5) MODO DE RESPOSTA ---
    let mode = "consultive";
    if (leadInfo.is_lead === false || (transitionApplied && !isDoubt) || isAgentButtonClick || isHumanRequest || isLinkIssue || effectiveComplaint || isDeniedFiserv || isCnpjDivergent) {
        mode = "parrot";
    }
    if ((isDoubt || isFarewell) && !isAgentButtonClick && !isHumanRequest && !isLinkIssue && leadInfo.is_lead !== false && !isDeniedFiserv && !isCnpjDivergent) {
        mode = "consultive";
    }
    if (isSelfSimulationRequest && leadInfo.is_lead !== false && !isDeniedFiserv) {
        mode = "consultive";
    }

    if (nextStep === 'apresenta_ofertas' && mode === 'parrot') {
        mode = 'consultive';
    }

    // --- 6) PROMPT FINAL ---
    let activeConfig = blueprint.steps[nextStep] || blueprint.steps["start"];
    if (isAgentButtonClick) activeConfig = blueprint.steps["explicacao_agente"];

    let forcedText = String(activeConfig?.rules || "");

    if (leadInfo.is_lead === false) {
        forcedText = `Olá${leadInfo.name ? ', *' + leadInfo.name + '*' : ''}! Tudo bem?\n\nNotei aqui que você ainda não possui um credenciamento ativo ou seus dados não constam na nossa base de ofertas pré-aprovadas no momento.\n\nPara realizar o seu credenciamento e ter acesso às nossas soluções de crédito e benefícios da Ticket, envie uma mensagem pelo WhatsApp para a nossa Central no número *11 4004-2233* ou acesse diretamente o link https://wa.me/551140042233.\n\nAssim que estiver tudo certinho, estarei por aqui!`;
        mode = "parrot";
        nextStep = "start";
    } else if (isAgentButtonClick) {
        forcedText = `Olá! Sou a Sofia, especialista da *Ticket*. Que bom que você quer saber mais!\n\nExplicando rapidamente: este é um reforço de caixa exclusivo para parceiros Ticket. Você pode ter de *R$ 10 mil a R$ 500 mil* com taxas a partir de *1,89% a.m.* O dinheiro cai na sua conta em até *24h* e o pagamento é feito via boleto bancário, sem comprometer seu limite de crédito.\n\n👉 Gostaria de fazer uma simulação do valor exato aqui mesmo pelo WhatsApp agora ou prefere tirar alguma dúvida antes? 📈`;
    } else if (isLinkIssue && forcedIncidentText) {
        forcedText = forcedIncidentText;
    } else if (nextStep === 'coleta_cnpj_correto' || isCnpjDivergent) {
        forcedText = `Entendi! As condições exclusivas de crédito são voltadas para estabelecimentos credenciados na Ticket.\n\nVocê poderia me informar o *CNPJ correto* da sua empresa?\n\nVou encaminhar o seu contato para um de nossos especialistas humanos entrar em contato pelo WhatsApp e validar o seu cadastro! 📞`;
        mode = "parrot";
        nextStep = 'coleta_cnpj_correto';
    } else if (isHumanRequest) {
        const isPhone = /\b(fone|telefone|ligar|ligação)\b/i.test(lastUserLower);
        if (isPhone) {
            forcedText = `Certo, *${leadInfo.name || "parceiro"}*! Para um atendimento mais detalhado e personalizado pelo telefone, recomendo que entre em contato diretamente com a nossa Central de Atendimento através do número *4004-2233*.\n\nEles estarão prontos para ajudar com todas as suas dúvidas sobre o reforço de caixa! 📞`;
        } else {
            forcedText = `Claro, entendo.\n\nVou solicitar para que um assessor entre em contato com você pelo WhatsApp em até *2 dias úteis* e siga com o seu atendimento.\n\nEnquanto isso, se quiser tirar alguma dúvida pontual por aqui, estou à disposição.`;
        }
    } else if (effectiveComplaint) {
        forcedText = `Certo, entendo perfeitamente sua frustração. Sinto muito que sua experiência atual esteja sendo assim.\n\nComo você mencionou esse problema, vou priorizar o seu contato com um de nossos consultores humanos para que ele verifique isso detalhadamente antes de qualquer outra coisa.\n\nVocê gostaria de falar sobre mais algum ponto específico antes do nosso especialista entrar em contato?`;
    } else if (currentStep === 'start' && assistantMessages.length < 2 && !isDeniedFiserv && nextStep !== 'recusa_analise' && nextStep !== 'desistencia_cliente') {
        forcedText = `Já pensou em reforçar o caixa sem burocracia?\n\nVocê pode ter até *R$ 500 mil* disponíveis, usando apenas seus recebíveis Ticket como garantia. A consulta é rápida e sem compromisso.\n\n✅ Taxas a partir de *1,89% a.m*;\n✅ Crédito disponível entre *10 mil a 500 mil reais*;\n✅ Recebimento do dinheiro em até *24h*;\n\n👉 Gostaria de fazer uma simulação sem compromisso aqui mesmo pelo WhatsApp ou ficou com alguma dúvida?`;
    } else if (nextStep === 'explicacao_agente') {
        forcedText = `Olá! Sou a Sofia, especialista da *Ticket*. Que bom que você quer saber mais!\n\nExplicando rapidamente: este é um reforço de caixa exclusivo para parceiros Ticket. Você pode ter de *R$ 10 mil a R$ 500 mil* com taxas a partir de *1,89% a.m.* O dinheiro cai na sua conta em até *24h* e o pagamento é feito via boleto bancário, sem comprometer seu limite de crédito.\n\n👉 Gostaria de fazer uma simulação do valor exato aqui mesmo pelo WhatsApp agora ou prefere tirar alguma dúvida antes? 📈`;
    } else if (nextStep === 'coleta_faturamento') {
        const isCartaoQuestion = /\b(cart[aã]o|cart[oõ]es|s[oó] no cart[aã]o|maquininha|total|geral)\b/i.test(lastUserLower) || /^cart[aã]o\??$/i.test(lastUserLower.trim());
        const isMuchMore = /\b(muito mais|bem mais|bastante|muito acima|alto|mais que isso|acima de|mais de|depende|n[aã]o sei exato|varia)\b/i.test(lastUserLower);
        const alreadyAskedFaturamento = lastSofiaMsg.includes("faturamento médio mensal") || lastSofiaMsg.includes("faturamento aproximado") || lastSofiaMsg.includes("qual o faturamento");
        const maskedCnpj = formatCnpjMasked(leadInfo.cnpj);
        const empresaTxt = leadInfo.name ? `para a empresa *${leadInfo.name}*` : 'para a sua empresa';
        const docTxt = maskedCnpj ? ` (CNPJ: *${maskedCnpj}*)` : '';

        if (isCartaoQuestion) {
            forcedText = `Pode ser o *faturamento total* da sua empresa (incluindo vendas no cartão, Pix, boletos, etc.). Uma média aproximada já é suficiente para a nossa simulação!\n\nLembrando que o pagamento do empréstimo é feito mensalmente via *Boleto Bancário*, sem desconto direto das suas vendas diárias de cartão.\n\nQual seria o faturamento médio mensal aproximado para seguirmos?\n\n_Exemplo: *100 mil*_`;
        } else if (isMuchMore) {
            forcedText = `Entendi que o faturamento é maior! 📈\n\nPara que possamos calcular o limite exato e as melhores condições para a *${leadInfo.name || "sua empresa"}*, você poderia me informar um valor aproximado em reais?\n\n_Exemplo: *150 mil*_`;
        } else if (alreadyAskedFaturamento) {
            forcedText = `Para avançarmos com a simulação sem compromisso, preciso apenas de um valor médio aproximado do faturamento mensal da *${leadInfo.name || "sua empresa"}* em reais.\n\n_Exemplo: *80 mil*_`;
        } else {
            forcedText = `Perfeito! Para avaliarmos a melhor proposta ${empresaTxt}${docTxt}, qual o *faturamento médio mensal* aproximado do seu negócio? 📈\n\n_Exemplo: *80 mil*_`;
        }
        mode = "parrot";
    } else if (nextStep === 'coleta_valor') {
        const rawNum = parseNumber(lastUserLower);
        if (rawNum !== null && rawNum < 10000) {
            forcedText = `O valor mínimo para solicitação de crédito é de *R$ 10.000,00* (e até R$ 500 mil).\n\nQual valor você gostaria de solicitar nessa análise?\n\n_Exemplo: *30 mil*_`;
        } else if (rawNum !== null && rawNum > 500000) {
            forcedText = `O valor máximo disponível para essa linha é de *R$ 500.000,00*.\n\nQual valor até esse limite você gostaria de solicitar?\n\n_Exemplo: *100 mil*_`;
        } else if (lastSofiaMsg.includes("valor aproximado") || lastSofiaMsg.includes("deseja solicitar") || lastSofiaMsg.includes("gostaria de solicitar") || lastSofiaMsg.includes("qual valor")) {
            forcedText = `Por favor, me informe apenas o valor aproximado que deseja solicitar para a análise de crédito da *${leadInfo.name || "sua empresa"}*.\n\n_Exemplo: *30 mil*_`;
        } else {
            forcedText = `Obrigada! E qual *valor aproximado* você gostaria de solicitar nessa análise?\n\n_Exemplo: *50 mil*_`;
        }
        mode = "parrot";
    } else if (nextStep === 'consentimento_optin') {
        forcedText = `Li e entendi o termo de autorização e autorizo o tratamento de meus dados, inclusive para consulta ao SCR/Bacen e Entidades registradoras.`;
        mode = "parrot";
    } else if (nextStep === 'optin_recusado') {
        forcedText = `Sem problema, *${leadInfo.name || "parceiro"}*. Gostaríamos de reforçar que só podemos seguir com a análise de crédito se você aceitar a pesquisa pela Fiserv. Se mudar de ideia, é só me chamar aqui que retomamos. 👍`;
        mode = "parrot";
    } else if (nextStep === 'desistencia_cliente') {
        forcedText = `Sem problemas, *${leadInfo.name || "parceiro"}*! Compreendo perfeitamente. Caso precise de reforço de caixa no futuro ou queira conhecer as condições para sua empresa, estarei por aqui à disposição. Tenha um ótimo dia! 👍`;
        mode = "parrot";
    } else if (nextStep === 'aguardando_fiserv') {
        forcedText = `Sua solicitação já está em análise pelo comitê da Fiserv! ⏳\n\nEstamos acompanhando de perto e, assim que tivermos um retorno sobre os valores liberados para o seu CNPJ *${leadInfo.cnpj || ""}*, chamaremos você por aqui mesmo com o resultado.\n\nEnquanto esperamos, posso te ajudar com mais alguma dúvida?`;
    } else if (nextStep === 'recusa_analise') {
        const nomeCliente = leadInfo.name ? `Olá, *${leadInfo.name}*!` : 'Olá!';
        const motivoFiserv = leadInfo.fiserv_external_status || "Analisamos sua solicitação e desta vez não conseguimos aprová-la devido a políticas internas de crédito.";
        const recusaAlreadySent = historyTexts.includes("não conseguimos liberar") || historyTexts.includes("políticas internas de crédito") || historyTexts.includes("politicas internas de credito");

        if (recusaAlreadySent) {
            // 🛡️ Lead já foi notificado da recusa. Silencia para não papaguear nem gerar atrito.
            // A mensagem do cliente fica gravada no banco e visível na Fila de Atendimento,
            // mas o robô não envia resposta e NÃO trava em human_active (preservando o ciclo de 30 dias).
            return {
                currentStep: "stop_flow",
                stop_flow: true,
                reason: "Lead já notificado de recusa Fiserv. Robô silenciado para evitar respostas repetitivas.",
                conversation_id: rpcData.conversation?.id || rpcData.p_conversation_id,
                p_conversation_id: rpcData.conversation?.id || rpcData.p_conversation_id
            };
        } else {
            forcedText = `${nomeCliente}\n\n${motivoFiserv}\n\nAs análises de crédito são dinâmicas e baseadas em critérios de mercado e volume de transações Ticket. Você poderá solicitar uma nova análise em *30 dias*!\n\nObrigado pela confiança na Ticket! 🙏`;
        }
        mode = "parrot";
    } else if (nextStep === 'criar_lead') {
        forcedText = `Perfeito! Sua solicitação já está em analise.\n\n⏳ Avaliando em ~1 minuto...\nAssim que tivermos o retorno, chamaremos aqui com o resultado!`;
        mode = "parrot";
    } else if (nextStep === 'apresenta_ofertas' && requested_amount && !requested_installments) {
        const approvedLimit = leadInfo.approved_limit || leadInfo.max_amount || leadInfo.credit_limit || leadInfo.approved_amount || ctx.approved_limit || 0;
        const maxTerm = leadInfo.max_installments || leadInfo.approved_installments || leadInfo.installments || 24;
        if (approvedLimit > 0 && requested_amount > approvedLimit) {
            forcedText = `O valor de *R$ ${Number(requested_amount).toLocaleString('pt-BR')}* que você solicitou excede o seu limite pré-aprovado de *R$ ${Number(approvedLimit).toLocaleString('pt-BR')}*.\n\nPor favor, informe o valor que deseja solicitar (até *R$ ${Number(approvedLimit).toLocaleString('pt-BR')}*) e em quantas parcelas (de 6 a ${maxTerm} parcelas).`;
        } else {
            forcedText = `Ótimo, *${leadInfo.name || "parceiro"}*! Entendi que você deseja simular o valor de *R$ ${Number(requested_amount).toLocaleString('pt-BR')}*.\n\nEm quantas parcelas você gostaria de simular? (Lembrando que o prazo é de 6 a ${maxTerm} parcelas).`;
        }
        mode = "parrot";
    } else if (nextStep === 'apresenta_ofertas' && !requested_amount && requested_installments) {
        forcedText = `Certo, você gostaria de simular em *${requested_installments} parcelas*.\n\nPara prosseguirmos, qual o valor exato que você deseja solicitar nessa simulação?`;
        mode = "parrot";
    } else if (nextStep === 'apresenta_ofertas' && !requested_amount && !requested_installments) {
        const approvedLimit = leadInfo.approved_limit || leadInfo.max_amount || leadInfo.credit_limit || leadInfo.approved_amount || ctx.approved_limit || 0;
        const maxTerm = leadInfo.max_installments || leadInfo.approved_installments || leadInfo.installments || 24;
        const limiteTxt = approvedLimit > 0 ? ` (seu limite pré-aprovado é de até *R$ ${Number(approvedLimit).toLocaleString('pt-BR')}*)` : '';
        forcedText = `Perfeito, *${leadInfo.name || "parceiro"}*! Vamos fazer uma nova simulação.\n\nPor favor, informe qual valor deseja simular${limiteTxt} e em quantas parcelas (de 6 a ${maxTerm} parcelas).`;
        mode = "parrot";
    } else if (nextStep === 'reforco_condicoes') {
        forcedText = `Agora que já falamos sobre a cotação, vamos falar de alguns detalhes importantes pra você dominar o produto e ficar tudo bem claro.\n\n*1- O que é esse empréstimo?*\nÉ uma linha de Capital de Giro Digital.\n*2- Qual é a garantia?*\nO gravame dos seus recebíveis futuros de Ticket, cartão de crédito e débito.\n*3- Como eu faço pagamento das parcelas, vocês fazem retenções?*\nNão fazemos retenções, você receberá boletos para pagamentos mensais.\n*4- Meu recebível ficará preso?*\nNÃO, a menos que você não pague as parcelas do empréstimo no vencimento.\n*5- Mas o que acontece se eu atrasar?*\nO sistema bloqueia seu recebível até liquidar a parcela, depois volta a liberar.\n*6- Eu consigo fazer antecipação do meu recebível se eu contratar o Capital de Giro da Ticket?*\nSIM, normalmente.\n\n*Clique no botão abaixo para prosseguir:*`;
        mode = "parrot";
    } else if (nextStep === 'finalizacao_sucesso') {
        forcedText = `Maravilha, *${leadInfo.name || "parceiro"}*!\nEstamos quase lá.\n\nAgora um dos nossos especialistas entrará em contato para pegar as últimas informações e liberar o crédito no sistema.\n\nMas se tiver alguma dúvida, estou por aqui!`;
        mode = "parrot";
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

    let consecutiveSameCount = 0;
    for (let i = assistantMessages.length - 1; i >= 0; i--) {
        const prevSofiaNorm = normalizeText(assistantMessages[i]?.content || assistantMessages[i]?.text);
        if (prevSofiaNorm === cleanNextText) {
            consecutiveSameCount++;
        } else {
            break;
        }
    }

    let stepRepetitionCount = 0;
    for (let i = assistantMessages.length - 1; i >= 0; i--) {
        const pastMsg = String(assistantMessages[i]?.content || assistantMessages[i]?.text || "").toLowerCase();
        let pastStep = null;
        if (pastMsg.includes("faturamento") || pastMsg.includes("faturamento médio") || pastMsg.includes("avaliarmos a melhor proposta")) pastStep = 'coleta_faturamento';
        else if (pastMsg.includes("valor aproximado") || pastMsg.includes("solicitar nessa análise") || pastMsg.includes("valor mínimo para solicitação") || pastMsg.includes("valor máximo disponível") || pastMsg.includes("deseja solicitar")) pastStep = 'coleta_valor';
        else if (pastMsg.includes("autorização à fiserv") || pastMsg.includes("termo de autorização") || pastMsg.includes("termos de autorização") || pastMsg.includes("li e entendi") || pastMsg.includes("autoriza a realização")) pastStep = 'consentimento_optin';
        else if (pastMsg.includes("cnpj") && pastMsg.includes("responsável")) pastStep = 'verificacao_cnpj';

        if (pastStep === nextStep) {
            stepRepetitionCount++;
        } else {
            break;
        }
    }

    const isClientAskingOrQualitative = isDoubt || lastUserLower.includes("?") || /\b(cart[aã]o|cart[oõ]es|muito mais|bem mais|bastante)\b/i.test(lastUserLower);
    const isLoopDetected = mode === 'parrot' && !isClientAskingOrQualitative && (consecutiveSameCount >= 2 || stepRepetitionCount >= 3) && cleanNextText.length > 0;

    let loopDetectedHandoff = false;
    if (isLoopDetected && leadInfo.is_lead !== false) {
        loopDetectedHandoff = true;
        forcedText = `Certo, *${leadInfo.name || "parceiro"}*! Para agilizar seu atendimento e te apoiar diretamente com essa etapa, vou transferir sua conversa para um de nossos especialistas. Um instante, por favor!`;
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
- PROIBIÇÃO ABSOLUTA DE LINKS / URLS: NUNCA gere links, URLs ou textos de redirecionamento no formato markdown como [Clique aqui](https://...) ou URLs fictícias/exemplo (como example.com). Toda comunicação de propostas e valores é feita via texto no próprio chat.
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

O faturamento médio que você pede é só de cartão ou o total da empresa?
Pode ser o faturamento total médio mensal da sua empresa (incluindo vendas no cartão, Pix, boletos, etc.). Uma média aproximada já é suficiente para a nossa simulação.

O pagamento das parcelas desconta direto das minhas vendas de cartão ou da maquininha?
Não! O pagamento das parcelas é feito mensalmente via Boleto Bancário. Suas vendas de cartão continuam caindo normalmente na sua conta, sem nenhum desconto diário automático. Seus recebíveis futuros servem apenas como garantia da operação se os boletos não forem pagos.

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
Você pode validar através do Portal Ticket onde temos banners sobre a parceria, ou entrar em contato com a nossa Central de Atendimento através do número *4004-2233*, e questionar sobre a oferta de crédito para a pessoa que realizar o seu atendimento!

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
Infelizmente não, durante o período em que o empréstimo estiver ativo, seu domicílio bancário com a Ticket fica vinculado à conta do banco BMP, como parte da garantia da operação. Essa alteração é temporária e serve apenas para permitir que os recebíveis Ticket passem por essa conta antes de serem repassados para a conta que você escolher no momento da contratação. Depois que todas as parcelas forem quitadas, você poderá alterar seu domicílio bancário normalmente pelo Portal do Estabelecimento.

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
Por segurança, a alteração de dados bancários só é feita pelo Portal do Estabelecimento em "Minha Conta" > "Dados Bancários" pelo próprio representante legal. Você precisará anexar: Contrato Social, Identidade do sócio (CNH/RG/Passaporte/RNE) e Comprovante Bancário da nova conta. Há necessidade de validação facial via câmera dos sócios. Se houver mais sócios administradores no Contrato Social, todos deverão fazer a validação facial e enviar o documento em até 72 horas.

Não estou conseguindo alterar minha conta. O que eu faço?
Se ocorrer qualquer erro no Portal durante o processo de alteração bancária, acione nossa Central de Atendimento no telefone *4004-2233* para obter suporte.

Qual o prazo para alterar meus dados bancários?
A alteração é concluída em até 2 dias úteis após a conclusão do envio de todos os documentos e realização das etapas de segurança (validação facial).

Onde vejo o andamento do meu pedido de alteração de dados bancários?
Acompanhe pelo Portal do Estabelecimento em "Minha Conta" > "Dados Bancários". A conta sob alteração apresentará o status "Em andamento".

Onde eu encontro o meu contrato Ticket?
Acesse o Portal do Estabelecimento, vá no menu "Minha Conta" > "Contrato".

Onde consulto as informações das taxas e tarifas?
No Portal do Estabelecimento, vá em "Minha Conta" > "Produtos e taxas" > "Taxas e tarifas".

Como funcionam as taxas e tarifas do meu contrato?
Elas variam conforme seu contrato e a campanha ativa no seu credenciamento. As principais taxas são:
- Anuidade: Manutenção cobrada a cada 12 meses.
- Tarifa de Adesão: Tarifa única, cobrada no 1º mês.
- Gestão de Pagamento: Cobrada a cada reembolso (ocorrem a cada 7 dias).
- Tarifa de Transação: Cobrada a cada transação com cartão na maquininha.
- Taxa de Administração: Porcentagem sobre a utilização dos serviços.
- Mensalidade: Tarifa de manutenção mensal.

Não recebi meu reembolso, o que devo fazer?
1) Se mudou de conta bancária, certifique-se de que a alteração foi concluída e atualizada no Portal. 2) Confirme a data de pagamento e o valor na aba "Extrato" no Portal. 3) Se não localizar, entre em contato com nossa Central de Atendimento no telefone *4004-2233* portando o extrato bancário e a cópia de sua folha de cheque.

Onde consulto as vendas que meu estabelecimento irá receber?
No Portal do Estabelecimento, na aba "Extrato".

Onde encontro o número de filiação da minha máquina?
Você o localiza no comprovante de venda impresso pela maquininha.

Onde posso alterar os meus dados cadastrais?
Acesse o Portal, vá em "Minha Conta" > "Dados Cadastrais" e clique em "Editar". Alterações de endereço exigem o anexo de um comprovante e levam até 5 dias úteis. Outros dados só podem ser alterados via Central *4004-2233*.

Tenho mais de um CNPJ. Como faço para ter visão unificada no Portal?
Acesse o Portal, clique na seta ao lado de sua Razão Social (topo) e selecione "Administrar CNPJs" > "Agrupar CNPJ".

Como funciona a Assistência 24h para estabelecimentos?
Oferece serviços de emergência como Chaveiro, Eletricista e Encanador. Para acionar ou cancelar os serviços ligue: 11-4196-8187 (São Paulo) ou 0800-771-7311 (demais cidades).

Onde consulto o informe de rendimentos (DIRF)?
No Portal do Estabelecimento, clique no botão rápido "DIRF-Informe de rendimentos".

Como realizar o credenciamento do meu estabelecimento na Ticket?
Envie uma mensagem pelo WhatsApp para a nossa Central no número 11 *4004-2233* ou acesse diretamente o link https://wa.me/551140042233 para ser direcionado e realizar o credenciamento.
</BASE_DE_CONHECIMENTO_FAQ>

<REGRA_MENSAGENS_NATURAIS>
1. NÃO seja repetitiva! Se você já fez uma pergunta direta ao usuário, NUNCA adicione frases genéricas no final.
2. Apenas use frases como "Posso seguir com a simulação ou tem dúvidas?" se você estiver tirando uma dúvida (FAQ) e a conversa estiver parada.
</REGRA_MENSAGENS_NATURAIS>

<regra_de_detalhamento_obrigatorio>
Estas informações são OBRIGATÓRIAS e NUNCA podem ser omitidas quando o assunto surgir:
1. INADIMPLÊNCIA / NÃO PAGAMENTO:
   - SEMPRE mencione que o desconto via recebíveis só ocorre após *3 a 4 meses* sem pagamento.
   - SEMPRE informe que após regularizar os boletos, o pagamento volta ao método de boleto.
2. GARANTIA DO EMPRÉSTIMO:
   - Responda apenas sobre o que foi perguntado: os recebíveis Ticket como garantia.
   - NÃO introduza espontaneamente conceitos de BMP, trava bancária ou domicílio bancário se o cliente não perguntou sobre isso.
</regra_de_detalhamento_obrigatorio>

<tom_de_voz>
- COMEÇO NATURAL: Comece as respostas de forma simples: "Certo", "Entendi", "Perfeito" ou "Vamos lá", sempre seguido do nome do cliente. 
- PROIBIDO: Iniciar com frases robóticas ou clichês de IA como "Entendo sua dúvida". Seja direta e humana.
- DETALHAMENTO NECESSÁRIO: Responda com o nível de detalhe necessário para sanar a dúvida, sem inventar informações.
- ESCOPO DA RESPOSTA: Responda apenas o que foi perguntado.
- FOCO NO NEGÓCIO: Se o cliente fizer perguntas fora de contexto, responda gentilmente convidando-o a tirar dúvidas sobre o reforço de caixa.
</tom_de_voz>

<empatia_e_personalizacao>
- EMOJI POR SEGMENTO: Analise o nome da empresa (${leadInfo.name}). Se identificar o tipo de negócio (Ex: Padaria 🍞, Farmácia 💊, Restaurante 🍽️, Oficina/Auto 🚗, Mercado 🛒, Consultoria/Serviços 💼, Café ☕, Açougue 🥩), use UM emoji em momentos oportunos.
- NATURALIDADE: Não use o emoji em todas as mensagens.
</empatia_e_personalizacao>

<regra_de_ouro>
1. CONTEXTO É REI: Antes de responder usando o FAQ genérico, verifique o <CONTEXTO_ATUAL>. Se o Status do Comitê Fiserv indicar "Pré-aprovado", "Proposta" ou "Aprovado", avise ao cliente que a análise JÁ FOI CONCLUÍDA com sucesso e convide para simular.
2. CONFORMIDADE REGULATÓRIA: Toda resposta sobre o produto DEVE ser rigorosamente baseada nos textos de <BASE_DE_CONHECIMENTO_FAQ>.
3. GANCHO DE RETORNO AO FUNIL: Sempre que responder a uma dúvida técnica, responda com precisão e adicione o gancho convidando o cliente a continuar a etapa atual (${nextStep}).
</regra_de_ouro>

<proibicoes_estritas>
- NUNCA ENVIAR DADOS TÉCNICOS: É expressamente proibido enviar termos técnicos, nomes de campos de sistema/banco (ex: loan_request, detail, simulation_data, id), mensagens de erro de sistema ou frases em inglês para o cliente. Toda comunicação deve ser 100% humanizada, acolhedora e em português claro.
- CLIENTES COM CRÉDITO RECUSADO: Se o status do Comitê Fiserv indicar recusa ou não aprovação, NUNCA convide para simular, NUNCA prometa simulação e NUNCA pergunte parcelas. Esclareça com empatia que a análise não foi aprovada pelo comitê neste momento e que uma nova avaliação poderá ser feita em 30 dias.
</proibicoes_estritas>

<CONTEXTO_ATUAL>
- Passo Anterior: ${currentStep}
- Passo Atual / Próximo: ${nextStep}
- Faturamento Informado: ${revenue ? 'R$ ' + Number(revenue).toLocaleString('pt-BR') : 'Não informado'}
- Valor Solicitado Informado: ${requested_amount ? 'R$ ' + Number(requested_amount).toLocaleString('pt-BR') : 'Não informado'}
- Parcelas Solicitadas: ${requested_installments ? requested_installments + ' parcelas' : 'Não informadas'}
- Status do Comitê Fiserv: ${leadInfo.fiserv_external_status || leadInfo.fiserv_status || "Não iniciado"}
- Ofertas Disponíveis: ${ctx.simulation_offers || "Não geradas ainda"}
- Link Enviado: ${linkAlreadySent}
- Nome da Empresa: ${leadInfo.razao_social || leadInfo.name || "Não informado"}
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

    finalPrompt = sanitizeUserFacingMessage(finalPrompt);

    let interactive_buttons = null;
    if (nextStep === 'verificacao_cnpj') {
        interactive_buttons = {
            tipo: "botoes",
            opcoes: ["Sim", "Não"],
            pre_message: null
        };
    } else if (nextStep === 'consentimento_optin') {
        interactive_buttons = {
            tipo: "botoes",
            opcoes: ["✅ SIM, AUTORIZO"],
            pre_message: null,
            media: {
                tipo: "documento",
                url: FISERV_TERM_PDF_URL,
                nome_arquivo: "Termo de autorização.pdf"
            }
        };
    } else if (nextStep === 'confirmacao_cliente') {
        interactive_buttons = {
            tipo: "botoes",
            opcoes: ["✅ Sim", "🔄 Nova simulação"],
            pre_message: null
        };
    } else if (nextStep === 'reforco_condicoes') {
        interactive_buttons = {
            tipo: "botoes",
            opcoes: ["👍 OK, entendi!"],
            pre_message: null
        };
    }

    const isHandoff = (isHumanRequest || effectiveComplaint || loopDetectedHandoff || nextStep === 'coleta_cnpj_correto' || currentStep === 'coleta_cnpj_correto') && !isAgentButtonClick;

    const isIdentityConfirmed = Boolean(
        (currentStep === 'verificacao_cnpj' && isAffirmative && !isDoubt) ||
        isIdentityConfirmedPrior ||
        leadInfo.identity_confirmed ||
        leadInfo.cnpj_confirmed ||
        ['coleta_faturamento', 'coleta_valor', 'consentimento_optin', 'criar_lead', 'apresenta_ofertas', 'solicitar_simulacao', 'confirmacao_cliente', 'reforco_condicoes', 'finalizacao_sucesso', 'simulacao'].includes(nextStep) ||
        ['coleta_faturamento', 'coleta_valor', 'consentimento_optin', 'criar_lead', 'apresenta_ofertas', 'solicitar_simulacao', 'confirmacao_cliente', 'reforco_condicoes', 'finalizacao_sucesso', 'simulacao'].includes(currentStep)
    );

    return {
        final_system_prompt: finalPrompt,
        p_conversation_id: rpcData.conversation?.id || rpcData.p_conversation_id,
        currentStep: nextStep,
        mode: mode,
        requested_amount: requested_amount,
        requested_installments: requested_installments,
        trigger_handoff: isHandoff,
        handoff_data: {
            initial_message: currentMsg,
            campaign_id: leadInfo.campaign_id || ctx.campaign_id,
            lead_id: leadInfo.id || ctx.lead_id,
            tenant_id: ctx.tenant_id,
            priority: (effectiveComplaint || loopDetectedHandoff || nextStep === 'coleta_cnpj_correto' || isCnpjDivergent) ? 'high' : 'medium'
        },
        identity_confirmed: isIdentityConfirmed,
        cnpj_confirmed: isIdentityConfirmed,
        lead_info: {
            ...leadInfo,
            cnpj: leadInfo.cnpj,
            phone: rpcData.payload?.phone || leadInfo.phone || ctx.payload?.phone,
            name: leadInfo.name,
            identity_confirmed: isIdentityConfirmed,
            cnpj_confirmed: isIdentityConfirmed,
            journey_type: isPreApprovedJourney ? 'pre_approved' : (leadInfo.journey_type || 'standard'),
            revenue: revenue || leadInfo.revenue,
            requested_amount: (isRestartSimulation && !userTypedNewNumbers) ? null : (requested_amount || leadInfo.requested_amount),
            requested_installments: (isRestartSimulation && !userTypedNewNumbers) ? null : (requested_installments || leadInfo.requested_installments)
        },
        revenue: revenue,
        requested_amount: requested_amount,
        debug: { nextStep, mode, isLinkIssue, isSelfSimulationRequest, currentCampaignId, loopDetected: isLoopDetected, semanticIntent, isComplaint, isFirstComplaint, effectiveComplaint, parsedRevenue: revenue, parsedAmount: requested_amount, hasPriorOptIn, isOptInWithin30Days, isIdentityConfirmed, isPreApprovedJourney, isCnpjDivergent },
        interactive_buttons: interactive_buttons,
        consent: (isPreApprovedJourney || nextStep === 'criar_lead' || isOptInAccepted || (currentStep === 'consentimento_optin' && isOptInAccepted)) ? {
            opt_in: true,
            opt_in_timestamp: (hasPriorOptIn && (leadInfo.consent?.opt_in_timestamp || leadInfo.consent?.timestamp)) ? (leadInfo.consent.opt_in_timestamp || leadInfo.consent.timestamp) : new Date().toISOString(),
            opt_in_ip: leadInfo.consent?.opt_in_ip || leadInfo.consent?.ip || rpcData.ip || rpcData.headers?.['x-forwarded-for'] || rpcData.headers?.['x-real-ip'] || rpcData.p_metadata?.ip || ctx.ip || "0.0.0.0",
            opt_in_ip_address: leadInfo.consent?.opt_in_ip_address || leadInfo.consent?.ip || rpcData.ip || rpcData.headers?.['x-forwarded-for'] || rpcData.headers?.['x-real-ip'] || rpcData.p_metadata?.ip || ctx.ip || "0.0.0.0",
            opt_in_signer_name: leadInfo.consent?.opt_in_signer_name || leadInfo.consent?.signer_name || leadInfo.name || "Cliente",
            consent_channel: isPreApprovedJourney ? "external_platform" : "whatsapp",
            consent_phone: leadInfo.consent?.consent_phone || leadInfo.consent?.phone || leadInfo.phone || leadInfo.whatsapp || rpcData.phone || rpcData.user_identifier || "Não informado",
            consent_text_version: leadInfo.consent?.consent_text_version || leadInfo.consent?.text_version || FISERV_TERM_VERSION,
            consent_text_hash: leadInfo.consent?.consent_text_hash || leadInfo.consent?.text_hash || FISERV_TERM_HASH,
            consent_document_url: leadInfo.consent?.consent_document_url || FISERV_TERM_PDF_URL,
            confirmation_message: (hasPriorOptIn && !isOptInAccepted && leadInfo.consent?.confirmation_message) ? leadInfo.consent.confirmation_message : (isPreApprovedJourney ? "OPTIN_EXTERNO_PREVIAMENTE_APROVADO" : lastUserLower),
            confirmation_message_id: (hasPriorOptIn && !isOptInAccepted && (leadInfo.consent?.confirmation_message_id || leadInfo.consent?.opt_in_message_id)) ? (leadInfo.consent.confirmation_message_id || leadInfo.consent.opt_in_message_id) : (rpcData.message_id || rpcData.wamid || "")
        } : null,
        fiserv_funnel: {
            step1_optin: (isPreApprovedJourney || nextStep === 'criar_lead' || isOptInAccepted || (currentStep === 'consentimento_optin' && isOptInAccepted)) ? (leadInfo.opt_in_completed_at || new Date().toISOString()) : null,
            step3_simulation: (requested_amount && requested_amount > 0) ? new Date().toISOString() : null,
            step4_confirmed: isHandoff ? new Date().toISOString() : null
        }
    };

} catch (globalError) {
    let fallbackText = "";
    try {
        const blueprint = $node["RPC - Acesso Entrada"].json.context?.agent?.workflow_blueprint || { steps: {} };
        fallbackText = blueprint.steps?.["start"]?.rules || "";
    } catch (e) { }

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
    } catch (e) { }

    try {
        const leadInfo = $node["RPC - Acesso Entrada"].json.context?.lead_info || {};
        fallbackText = fallbackText
            .replace(/{{lead_info\.cnpj}}/gi, `*${leadInfo.cnpj || "não informado"}*`)
            .replace(/{{lead_info\.name}}/gi, `*${leadInfo.name || "não informado"}*`)
            .replace(/{{lead_info\.link}}/gi, leadInfo.link || "https://fiserv.ticket.com.br/simulacao-sofia");

        fallbackText = fallbackText
            .replace(/loan request is not eligible for simulation/gi, 'A proposta não está disponível para cálculo de simulação no momento')
            .replace(/\b(loan_request_id|loan request|simulation_data|http_status|error_code|detail|status_code)\b/gi, '')
            .replace(/not eligible/gi, 'não elegível')
            .replace(/\b(undefined|null|NaN)\b/g, '')
            .trim();
    } catch (e) { }

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
