/* 🧭 ROTEADOR DE CONTEXTO - JORNADA NATIVA FISERV V31.1 (BLINDAGEM TOTAL: EXPURGO DE AUTO-RESPOSTAS, PARSER MONETÁRIO BR E FIM DO LOOP DE FATURAMENTO) */

/* MUDANÇAS V31.1 (22/OUT - CORREÇÕES DE CAMPO):
   1. Blindagem Rigorosa de Auto-Respostas (Casos 1 e 3):
      - Inclusão de assinaturas de WhatsApp Business ("nossa equipe irá responder", "agradecemos a preferência", "é um prazer te ter aqui").
      - Inclusão de plataformas de delivery e catálogos (ifood, pedeagora, cardapioweb, ubereats, 99food, etc.).
      - Detecção de diretório de lojas (múltiplos telefones com traço + links).
      - Bloqueio de extração de telefones comerciais como valores de empréstimo ou faturamento (elimina falso opt-in de robôs).
   2. Parser Monetário Robusto para Formato Brasileiro (Caso 2):
      - Suporte determinístico a números com dupla vírgula (ex: "15,000,00" -> R$ 15.000,00 e não R$ 1.500.000,00).
      - Evita estouro do teto de R$ 500k e destrava avanço imediato para opt-in quando valor e faturamento são informados.
   3. Eliminação do Fallback Artificial de 1 Único Número & Fim do Loop (Casos 4 e 5):
      - Se o cliente informar apenas 1 valor (ex: "25 mil" ou "40"): Sofia registra o empréstimo e solicita educadamente o faturamento médio mensal, sem assumir falsamente que faturamento = empréstimo.
      - Se o cliente complementar o faturamento em seguida (ex: "Faturamento 80mil"), Sofia acolhe o faturamento, mantém o empréstimo e reapresenta o botão de opt-in sem regredir ou resetar o fluxo.
      - Removido "faturamento" isolado de regexDoubt para que respostas com valores de receita não sejam tratadas como dúvidas de LLM.
*/
/* MUDANÇAS V30.0:
   1. Prioridade 1 - Refinamento de Engajamento e Expurgo de Robôs:
      - Na 1ª mensagem do contato, validação estrita: apenas cliques nos botões ("Quero simular!" / "Falar com um agente!")
        OU saudações curtas humanas isoladas (<= 15 caracteres: "oi", "olá", "bom dia") são contabilizadas como engajamento.
      - Mensagens automáticas de cardápios, delivery, horários ou textos longos não reconhecidos são identificadas como auto-respostas,
        interrompendo o fluxo com stop_flow: true e is_auto_reply: true, blindando métricas e evitando diálogos com cardápios.
   2. Prioridade 2 - Comunicação Enxuta (Ticket Page 5):
      - Removida a repetição de Razão Social completa e CNPJ mascarado nas perguntas de valor e faturamento.
      - coleta_valor: "Certo! Qual o valor desejado para solicitar na análise?

_Ex.: 50 mil_"
      - coleta_faturamento: "Ok! Para avaliarmos a melhor condição disponível para sua empresa, poderia nos informar o faturamento médio mensal atual?

_Ex.: 80 mil_"
   3. Prioridade 3 - Flexibilidade na Captura de Faturamento & Guardrail:
      - Suporte determinístico a gírias (k, mil, mi, milhões), faixas ("40 a 50 mil" -> 50.000), referências ao exemplo
        ("algo em torno disso" -> 80.000) e tolerância conversacional sem retrabalho.
   4. Prioridade 4 - Reengajamento Opt-in de Alta Conversão:
      - Suporte contextual ao novo copy de 1 etapa ("Falta apenas uma etapa...").
   5. Prioridade 5 - Mitigação de Rupturas Pós-Opt-in (Abordagem A):
      - Eliminação de mensagens de erro técnico ao cliente e confirmação acolhedora de recebimento.
*/
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

    // 🛡️ RESGATE AUTOMÁTICO DE LEAD DE CAMPANHA (PROTEÇÃO CONTRA FALHA DE 9º DÍGITO ZENVIA)
    // Se a busca inicial retornou is_lead = false mas há histórico de disparo de campanha Ticket/Fiserv para este número,
    // resgata o lead como legítimo para evitar direcionamento indevido para a central 4004.
    const hasPriorCampaignOutbound = history.some(m => {
        const isBot = ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || m.role || m.sender || m.direction || '').toLowerCase());
        const content = String(m.content || m.text || '').toLowerCase();

        // ⛔ NUNCA considerar mensagens de recusa / não-credenciamento como disparo de campanha
        if (content.includes('não possui um credenciamento ativo') || 
            content.includes('nao possui um credenciamento ativo') || 
            content.includes('4004-2233') || 
            content.includes('wa.me/551140042233')) {
            return false;
        }

        return isBot && (
            content.includes('reforçar o caixa') || 
            content.includes('reforco de caixa') ||
            content.includes('capital de giro') || 
            content.includes('recebíveis futuros') || 
            content.includes('recebiveis futuros') ||
            content.includes('500 mil') ||
            content.includes('simulação sem compromisso') ||
            content.includes('simulacao sem compromisso')
        );
    });

    if (leadInfo.is_lead === false && hasPriorCampaignOutbound) {
        leadInfo.is_lead = true;
        if (!leadInfo.name) {
            for (const m of history) {
                const text = String(m.content || m.text || '');
                const matchName = text.match(/Olá\s+([A-ZÀ-Úa-zà-ú\s]+?)[,!.]?\s+(?:já pensou|tudo bem|bom dia|boa tarde)/i);
                if (matchName && matchName[1].trim().length > 2) {
                    leadInfo.name = matchName[1].trim();
                    break;
                }
            }
        }
    }

    // --- 1) HISTÓRICO E DETECÇÃO DE ESTADO ---
    const assistantMessages = history.filter(m =>
        ['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || m.role || m.sender || m.direction).toLowerCase())
    );
    const lastSofiaMsg = String(assistantMessages[assistantMessages.length - 1]?.content || assistantMessages[assistantMessages.length - 1]?.text || "").toLowerCase().replace(/\*/g, '');
    const secondLastSofiaMsg = String(assistantMessages[assistantMessages.length - 2]?.content || assistantMessages[assistantMessages.length - 2]?.text || "").toLowerCase().replace(/\*/g, '');
    const historyTexts = history.map(m => String(m.content || m.text || "").toLowerCase().replace(/\*/g, '')).join(" ");

    // 🛡️ Detecção de simulação prévia e confirmação de identidade no histórico
    const hasSimulatedInHistory = Boolean(
        historyTexts.includes("simulação concluída") || 
        historyTexts.includes("simulacao concluida") || 
        historyTexts.includes("valor solicitado: r$") ||
        historyTexts.includes("podemos seguir nessas condições") ||
        historyTexts.includes("podemos seguir nessas condicoes") ||
        historyTexts.includes("podemos seguir com essa condição") ||
        historyTexts.includes("podemos seguir com essa condicao") ||
        historyTexts.includes("já calculamos a sua simulação") ||
        historyTexts.includes("ja calculamos a sua simulacao") ||
        historyTexts.includes("já adiantamos e calculamos") ||
        historyTexts.includes("ja adiantamos e calculamos") ||
        leadInfo.simulation_data || 
        (leadInfo.requested_amount && leadInfo.requested_installments)
    );

    const currentMsg = String(
        (typeof $node !== 'undefined' && $node["Edit Fields"]?.json?.message) ??
        (typeof $node !== 'undefined' && $node["Edit Fields"]?.first?.()?.json?.message) ??
        (typeof $json !== 'undefined' ? ($json?.content ?? $json?.text ?? $json?.message ?? $json?.body) : undefined) ??
        rpcData?.message ??
        rpcData?.payload?.content ??
        rpcData?.payload?.message ??
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

    // 💰 LIMITE PRÉ-APROVADO OFICIAL FISERV / TICKET (GOVERNANÇA ANTI-422)
    const approvedLimit = Number(
        leadInfo.fiserv_amount_approved ||
        leadInfo.approved_limit ||
        leadInfo.max_amount ||
        leadInfo.credit_limit ||
        leadInfo.approved_amount ||
        ctx.approved_limit ||
        ctx.fiserv_amount_approved ||
        0
    );

    function formatPtBrMoney(val) {
        if (val === null || val === undefined || isNaN(val)) return "0";
        const num = Number(val);
        const hasCents = (num % 1) !== 0;
        return num.toLocaleString('pt-BR', {
            minimumFractionDigits: hasCents ? 2 : 0,
            maximumFractionDigits: 2
        });
    }

    // =========================================================================
    // 🛡️ CIRCUIT BREAKER ANTI-LOOP TRIPLO & DETECTOR DE AUTO-RESPOSTAS (UNIVERSAL)
    // =========================================================================

    // 1. Assinaturas Semânticas de Auto-Respostas, Cardápios, Horários e Robôs (Expandido V31.1 com WhatsApp Business, delivery e diretório)
    const regexAutoReply = /(agradece(mos)? (a prefer[eê]ncia|seu contato|sua mensagem)|[eé] um prazer te ter aqui|nossa equipe (ir[aá]|vai) responder|assim que poss[ií]vel (nossa equipe|responderemos|retornaremos)|(nosso )?atendimento (de segunda|das? \d{1,2}|ao?s? domingos?|comercial)|pronta entrega|pedeagora(\.net)?|ifood(\.com\.br)?|ubereats|99food|beefood|menudin|unidades? mais pr[oó]xima|bolos do s[ií]tio|fale em uma das unidades|agradece seu contato|como podemos ajudar|como posso te ajudar|como posso ajudar voc[eê]|qual o motivo da sua mensagem|escolha uma das op[çc][õo]es|digite o n[uú]mero|digite a op[çc][aã]o|não est(ou|amos) (dispon[ií]ve|atendendo)|não estamos funcionando|não está funcionando|não est(ou|amos) operando|funcionamos de .* [aà]s?|fora de hor[aá]rio|hor[aá]rio de atendimento|horário de funcionamento|hor[aá]rio comercial|estamos fechados|fechado no momento|estamos abertos|aberto de|faça seu pedido|faca seu pedido|fazer pedido|fazer pedidos|nosso card[aá]pio|card[aá]pio digital|acesse nosso cat[aá]logo|atendente foi solicitado|atendimento feito por pessoas|responderemos assim que poss[ií]vel|em breve retornaremos|retornaremos em breve|retornaremos assim que|retornaremos o contato|expediente foi encerrado|hora marcada|pedidos pelo whatsapp|para realizar seu pedido|para agilizar (o|seu) atendimento|agilizar o seu atendimento|endere[cç]o de entrega|AutoResponder|prezado(a)? cliente|voc[eê] est[aá] n[ao]|voc[eê] talvez busque|ordem de chegada|cobramos taxa|taxa de entrega|taxa de servi[cç]o|seja bem-vindo|bem-vindo(a)? [aà]|obrigad[ao] pelo contato|obrigad[ao] pela compreens[aã]o|conheça nossas m[ií]dias|mensagem autom[aá]tica|resposta autom[aá]tica|atendimento autom[aá]tico|este canal [eé] exclusivo|este n[uú]mero (não recebe|não aceita) ligaç|marmita|marmitas|marmitex|almo[cç]o de hoje|prato do dia|🤖|[rR]ob[oô]|l[ií]v[iI]a|rob[oô]\s+\w+|rob[oô] l[eé]o|atendente virtual|bot de atendimento|chat errado|chats diferentes|conversa errada|conversas diferentes|papos diferentes|lugar errado|n[uú]mero errado|numero errado|pedir algo pra comer|monto seu pedido|monto tudo pra voc[eê]|t[aá] aberto agora|aberto agora|movorafood|cardapioweb|anota\.ai|ola\.click|cardapio\.menu|instadelivery|hubt\.com|goomer|saipos|pediraqui|(s[oó] vende|vendemos|a gente faz|a gente s[oó] faz|a gente vende)\s+(salgado|pastel|churro|pizza|marmita|lanche|comida|hamburguer))/i;

    // Detecção estrutural de diretórios/catálogos de lojas (múltiplos telefones com hífen + URLs)
    const isStoreDirectory = (/\b\d{4,5}-\d{4}\b.*\b\d{4,5}-\d{4}\b/s.test(lastUserLower) || /\b\d{4,5}-\d{4}\b/s.test(lastUserLower)) && /https?:\/\//i.test(lastUserLower);

    // 🔘 P1: Botões oficiais da campanha (Ticket / Fiserv)
    const isExactButtonClick = [
        'quero simular!', 'quero simular', 
        'falar com um agente!', 'falar com um agente', 
        'simular', 'simulação', 'simulacao', 'simulação!', 'simulacao!',
        'quero uma simulação', 'quero uma simulacao', 'quero simulacao', 'quero simulação',
        'falar com especialista', 'falar com um especialista', 'falar especialista',
        'nova simulação', 'nova simulacao',
        'ver quanto posso ter', 'falar com agente (ia)', 'dúvidas – falar agente'
    ].includes(lastUserLower) || ['button_reply', 'interactive'].includes(String(rpcData.message?.type || '').toLowerCase());

    const isExplicitSimulationIntent = /\b(quero simular|fazer simula[çc][ãa]o|ver simula[çc][ãa]o|gostaria de simular|solicitar simula[çc][ãa]o|quanto posso pegar|fazer uma proposta|ver minhas taxas)\b/i.test(lastUserLower);

    // 🛡️ Blindagem estrita: mensagens de auto-resposta (ex: cardápios com "não cobramos taxa" ou diretórios de lojas) NUNCA são classificadas como clique de botão
    const isButtonTemplateClick = (isExactButtonClick || isExplicitSimulationIntent) && !regexAutoReply.test(lastUserLower) && !isStoreDirectory;

    // 🙋 P1: Saudações Humanas Curtas Isoladas (<= 15 caracteres)
    const regexStrictGreeting = /^(ol[aá]|oi|oie|opa|bom dia|boa tarde|boa noite)[!.,\s]*$/i;
    const isStrictGreeting = lastUserLower.length <= 15 && regexStrictGreeting.test(lastUserLower.trim());

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
    const lastBotMsg = botMsgs.length > 0 ? (botMsgs[botMsgs.length - 1]?.content || botMsgs[botMsgs.length - 1]?.text || '') : '';
    const lastBotLower = String(lastBotMsg).toLowerCase();

    // Detecção 3A: Cliente enviou exatamente o mesmo texto consecutivo (ex: 2+ repetições seguidas = 3+ mensagens idênticas)
    if (currentNormalized.length > 5 && userMsgs.length >= 2) {
        const lastInHistory = normalizeForComparison(userMsgs[userMsgs.length - 1]?.content || userMsgs[userMsgs.length - 1]?.text);
        const checkIdx = (currentNormalized === lastInHistory) ? userMsgs.length - 2 : userMsgs.length - 1;

        if (checkIdx >= 0) {
            const prevUserNormalized = normalizeForComparison(userMsgs[checkIdx]?.content || userMsgs[checkIdx]?.text);
            if (currentNormalized === prevUserNormalized) {
                repeatCount++;
                if (checkIdx - 1 >= 0) {
                    const prev2UserNormalized = normalizeForComparison(userMsgs[checkIdx - 1]?.content || userMsgs[checkIdx - 1]?.text);
                    if (currentNormalized === prev2UserNormalized) repeatCount++;
                }
            }
        }

        const isLeadActive = hasPriorOptIn || hasSimulatedInHistory || hasActiveLoan;
        const threshold = isLeadActive ? 3 : 2;
        if (repeatCount >= threshold) {
            isIdenticalUserRepeated = true;
        }
    }

    // Detecção 3B: Eco / Ping-Pong (Cliente ecoou o que o robô mandou ou o robô ecoou o cliente)
    // 🛡️ Blindagem: Só considera eco real se o texto for longo (>= 35 caracteres) e idêntico, evitando falso-positivo em palavras-chave como "simulação"
    if (currentNormalized.length >= 35 && botMsgs.length > 0 && !isButtonTemplateClick) {
        const lastBotNormalized = normalizeForComparison(botMsgs[botMsgs.length - 1]?.content || botMsgs[botMsgs.length - 1]?.text);
        if (currentNormalized === lastBotNormalized || (lastBotNormalized.length > 35 && lastBotNormalized.startsWith(currentNormalized))) {
            isEchoPingPong = true;
        }
    }

    // Detecção 3C: Frequência Acelerada em Janela Curta (Burst de robôs: >= 4 mensagens em menos de 10 segundos com repetição)
    if (history.length >= 4) {
        const recentSlice = history.slice(-4);
        const firstTime = new Date(recentSlice[0].created_at || Date.now()).getTime();
        const lastTime = new Date(recentSlice[recentSlice.length - 1].created_at || Date.now()).getTime();
        const timeDiffSec = Math.abs(lastTime - firstTime) / 1000;
        if (timeDiffSec >= 0 && timeDiffSec <= 10 && (repeatCount >= 2 || isEchoPingPong)) {
            isHighFrequencyBurst = true;
        }
    }

    // Detecção 3D: Loop Alternado (Sofia repete prompts de valor ou mensagens de handoff)
    const botHandoffCount = botMsgs.filter(m => {
        const c = String(m.content || m.text || '').toLowerCase();
        return c.includes("vou solicitar para que um assessor") || c.includes("consultores humanos para que ele verifique");
    }).length;

    const botAmountPromptCount = botMsgs.filter(m => {
        const c = String(m.content || m.text || '').toLowerCase();
        return c.includes("qual o valor desejado para solicitar") || c.includes("qual o valor que você gostaria de solicitar");
    }).length;

    const isAlternatingLoop = (botHandoffCount >= 2 && botAmountPromptCount >= 2) || (botHandoffCount >= 3) || (botAmountPromptCount >= 4 && !hasPriorOptIn && !leadInfo.revenue);

    // Detecção 3E: Hard Message Cap (contato enviou >= 5 mensagens sem opt-in, receita ou clique em botão)
    const isHardCapReached = userMsgs.length >= 5 && !hasPriorOptIn && !hasSimulatedInHistory && !leadInfo.revenue && !isButtonTemplateClick;

    // 🛡️ P1: Detecção de Auto-Resposta e Circuit Breaker
    const isAutoReplyDetected = !isButtonTemplateClick && !hasPriorOptIn && !hasActiveLoan && (regexAutoReply.test(lastUserLower) || isStoreDirectory);
    const isLeadActive = hasPriorOptIn || hasSimulatedInHistory || hasActiveLoan;
    const isCircuitBreakerTriggered = !isButtonTemplateClick && (
        isLeadActive 
            ? (repeatCount >= 3 || (isEchoPingPong && repeatCount >= 2) || isAlternatingLoop)
            : (isIdenticalUserRepeated || isEchoPingPong || isHighFrequencyBurst || isAlternatingLoop || isHardCapReached)
    );

    if (isAutoReplyDetected || isCircuitBreakerTriggered) {
        const stopReason = isAutoReplyDetected
            ? "Auto-resposta detectada: mensagem de ausência, cardápio ou robô do WhatsApp Business recebida. Fluxo pausado aguardando interação humana."
            : `Circuit Breaker Anti-Loop ativado: padrão repetitivo detectado (repetição: ${repeatCount}, eco: ${isEchoPingPong}, rajada: ${isHighFrequencyBurst}, loop alternado: ${isAlternatingLoop}, teto de mensagens: ${isHardCapReached}). Fluxo interrompido com segurança.`;

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

    // 🛑 DETECÇÃO 3F: ANTI-LOOP DE CORTESIA / EMOJIS DE ENCERRAMENTO
    // Se a última mensagem da Sofia já foi uma despedida/encerramento de atendimento,
    // e o usuário respondeu apenas com emoji ou agradecimento curto (<= 15 caracteres),
    // NÃO disparar nova mensagem para evitar loop infinito de gentilezas ("Combinado! Tenha um ótimo dia...").
    const isLastBotFarewell = (
        lastBotLower.includes("tenha um ótimo dia") ||
        lastBotLower.includes("tenha um bom dia") ||
        lastBotLower.includes("fico por aqui à disposição") ||
        lastBotLower.includes("fico por aqui a disposicao") ||
        lastBotLower.includes("estou à disposição") ||
        lastBotLower.includes("estou a disposicao") ||
        lastBotLower.includes("se precisar de algo") ||
        lastBotLower.includes("se mudar de ideia") ||
        lastBotLower.includes("obrigado pela confiança") ||
        lastBotLower.includes("obrigada pela confiança")
    );

    const isShortAckOrEmoji = (
        currentMsg.length <= 15 &&
        !currentMsg.includes("?") &&
        /^(👍|🙏|😊|😁|🙌|👏|❤️|🙂|😉|ok|blz|valeu|obrigado|obrigada|show|combinado|tchau|ótimo|otimo|perfeito|grato|grata|certo)$/i.test(currentMsg.trim().toLowerCase())
    );

    if (isLastBotFarewell && isShortAckOrEmoji) {
        return {
            currentStep: "stop_flow",
            stop_flow: true,
            is_auto_reply: true,
            reason: "Encerramento cordial com emoji/agradecimento (anti-loop de despedida)",
            conversation_id: rpcData.conversation?.id || rpcData.p_conversation_id,
            p_conversation_id: rpcData.conversation?.id || rpcData.p_conversation_id,
            trigger_handoff: false,
            handoff_data: {}
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
        let clean = text.toLowerCase().trim().replace(/[.,]+$/, '');

        // 🛡️ Guardrail contra falsos positivos: porcentagens, horários, recusas e denúncias não são valores de empréstimo/faturamento
        if (/\b(\d+(?:[.,]\d+)?\s*(?:%|por\s*cento|porcento))\b/i.test(clean) && !/\b(mil|k|reais|r\$)\b/i.test(clean)) {
            return null;
        }
        if (/\b(\d{1,2}h\d{0,2})\b/i.test(clean)) {
            return null; // Horário de funcionamento (ex: "20h30")
        }
        if (/\b(n[aã]o\s+quero|n[aã]o\s+tenho\s+interesse|n[aã]o\s+autorizo|sem\s+interesse|fraude|golpe|den[uú]ncia)\b/i.test(clean)) {
            return null;
        }

        // 🎯 P3: Referência direta ao exemplo fornecido na mensagem anterior
        if (/\b(algo em torno disso|mais ou menos isso|por [aá][ií]|pode ser isso|isso mesmo|em torno do exemplo)\b/i.test(clean)) {
            if (lastBotLower.includes("80 mil")) return 80000;
            if (lastBotLower.includes("50 mil")) return 50000;
        }

        // 🎯 P3: Suporte a "mi", "milhão", "milhões" (ex: "1.5 mi" -> 1.500.000)
        const miMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*(?:milh[oõ]es|milh[aã]o|mi)\b/i);
        if (miMatch) {
            let numStr = miMatch[1].replace(/\./g, '').replace(',', '.');
            let val = parseFloat(numStr);
            if (!isNaN(val)) return val * 1000000;
        }

        // 🎯 P3: Suporte a faixas de valores ("40 a 50 mil", "entre 30 e 40k") -> adota o teto
        const rangeMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*(?:a|e|at[eé])\s*(\d+(?:[.,]\d+)?)\s*(?:mil|k)\b/i);
        if (rangeMatch) {
            let upperStr = rangeMatch[2].replace(/\./g, '').replace(',', '.');
            let val = parseFloat(upperStr);
            if (!isNaN(val)) return val * 1000;
        }

        // 🛡️ Fix Brasileiro: "8,921,00 mil", "9.000,00 mil", "9.000 mil"
        const milMatch = clean.match(/([\d.,]+)\s*(?:mil|k)\b/i);
        if (milMatch) {
            let rawNum = milMatch[1].replace(/[.,]+$/, '');
            let val = null;
            if (rawNum.includes('.') && rawNum.includes(',')) {
                val = parseFloat(rawNum.replace(/\./g, '').replace(',', '.'));
            } else if (rawNum.includes(',')) {
                const parts = rawNum.split(',');
                if (parts.length === 2 && parts[1].length === 2 && parts[0].length >= 3) {
                    val = parseFloat(rawNum.replace(',', '.'));
                } else if (parts.length > 2) {
                    val = parseFloat(parts.slice(0, -1).join('') + '.' + parts[parts.length - 1]);
                } else {
                    val = parseFloat(rawNum.replace(',', '.'));
                }
            } else {
                val = parseFloat(rawNum);
            }
            if (!isNaN(val)) {
                if (val >= 1000) return val; // Já está em valor nominal completo
                return val * 1000;
            }
        }

        clean = clean.replace(/\bem\s+\d+(?:\s*(?:x|vezes|parcelas?))?\b/gi, '').trim();
        clean = clean.replace(/\b\d+\s*(?:x|vezes|parcelas?)\b/gi, '').trim();

        if (clean.includes('.') && clean.includes(',')) {
            if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
                const parts = clean.split(',');
                clean = parts.slice(0, -1).join('').replace(/\./g, '') + '.' + parts[parts.length - 1];
            } else {
                const parts = clean.split('.');
                clean = parts.slice(0, -1).join('').replace(/,/g, '') + '.' + parts[parts.length - 1];
            }
        } else if (clean.includes(',')) {
            const parts = clean.split(',');
            if (parts.length >= 2 && parts[parts.length - 1].length <= 2) {
                clean = parts.slice(0, -1).join('').replace(/\./g, '') + '.' + parts[parts.length - 1];
            } else if (parts.length === 2 && parts[1].length === 3) {
                clean = parts.join('');
            } else {
                clean = clean.replace(/,/g, '');
            }
        } else if (clean.includes('.')) {
            const parts = clean.split('.');
            if (parts.length >= 2 && parts[parts.length - 1].length === 3) {
                clean = parts.join('');
            }
        }
        clean = clean.replace(/[^0-9.]/g, '');
        let parsed = parseFloat(clean);
        return isNaN(parsed) ? null : parsed;
    }

    // 🎯 V31.1: EXTRATOR UNIFICADO ESTILO LP (VALOR SOLICITADO + FATURAMENTO COM PARSER BR BLINDADO)
    function parseSingleValue(token) {
        if (!token) return null;
        let str = String(token).toLowerCase().trim().replace(/^r\$\s*/, '').replace(/[.,]+$/, '');
        
        if (/\b(?:mi|milh[aã]o|milh[oõ]es)\b/i.test(str)) {
            let num = parseFloat(str.replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.'));
            return isNaN(num) ? null : num * 1000000;
        }

        const hasMil = /\b(?:mil|k)\b/i.test(str);
        let numStr = str.replace(/\b(?:mil|k)\b/gi, '').trim();

        if (numStr.includes('.') && numStr.includes(',')) {
            if (numStr.lastIndexOf(',') > numStr.lastIndexOf('.')) {
                // Padrão BR: 15.000,00 -> 15000
                const parts = numStr.split(',');
                numStr = parts[0].replace(/\./g, '');
            } else {
                // Padrão US: 15,000.00 -> 15000
                const parts = numStr.split('.');
                numStr = parts[0].replace(/,/g, '');
            }
        } else if (numStr.includes(',')) {
            const parts = numStr.split(',');
            // Suporte a dupla vírgula (ex: "15,000,00") ou centavos simples ("15,00")
            if (parts[parts.length - 1].length === 2 && parts.length >= 2) {
                numStr = parts.slice(0, -1).join('');
            } else if (parts.length === 2 && parts[1].length === 3) {
                numStr = parts.join('');
            } else {
                numStr = numStr.replace(/,/g, '');
            }
        } else if (numStr.includes('.')) {
            const parts = numStr.split('.');
            if (parts.length === 2 && parts[1].length === 2) {
                numStr = parts[0];
            } else if (parts.length >= 2 && parts[parts.length - 1].length === 3) {
                numStr = parts.join('');
            } else {
                numStr = numStr.replace(/\./g, '');
            }
        }

        let val = parseFloat(numStr.replace(/[^0-9.]/g, ''));
        if (isNaN(val)) return null;

        if (hasMil) {
            if (val < 1000) val *= 1000;
        } else if (val >= 10 && val <= 500) {
            val *= 1000;
        }

        return val;
    }

    function extractLoanAndRevenue(text) {
        if (!text) return { requestedAmount: null, revenue: null };
        let clean = String(text).toLowerCase().trim();

        // 🛡️ Blindagem V31.1: Se o texto for auto-resposta ou diretório de lojas, não extrai valores
        if (regexAutoReply.test(clean) || (/\b\d{4,5}-\d{4}\b/s.test(clean) && /https?:\/\//i.test(clean))) {
            return { requestedAmount: null, revenue: null };
        }

        // Remove telefones com traço (ex: 4101-0596, 99259-5887) para não extrair pedaços como empréstimo/faturamento
        clean = clean.replace(/\b\d{4,5}-\d{4}\b/g, '');

        const wordMap = {
            'cinquenta e cinco': 55, 'cinquenta': 50, 'quarenta e cinco': 45, 'quarenta': 40,
            'trinta e cinco': 35, 'trinta': 30, 'vinte e cinco': 25, 'vinte': 20, 'quinze': 15, 'dez': 10,
            'sessenta': 60, 'setenta': 70, 'oitenta': 80, 'noventa': 90, 'cem': 100, 'cento': 100,
            'duzentos': 200, 'trezentos': 300, 'quatrocentos': 400, 'quinhentos': 500
        };

        for (const [w, val] of Object.entries(wordMap)) {
            clean = clean.replace(new RegExp(`\\b${w}\\b`, 'gi'), val);
        }

        let semanticReq = null;
        let semanticRev = null;

        const reqPattern = /(?:quero|preciso|solicito|empr[eé]stimo|cr[eé]dito|valor|pegar)\s*(?:de|em torno de|at[eé])?\s*(r?\$?\s*[\d.,]+(?:\s*(?:mil|k))?)/i;
        const revPattern = /(?:faturamento|faturamos|faturo|vendo|vendas|receita|ganho)\s*(?:de|em torno de|mensal(?:mente)?)?\s*(r?\$?\s*[\d.,]+(?:\s*(?:mil|k))?)/i;

        const matchReq = clean.match(reqPattern);
        if (matchReq) semanticReq = parseSingleValue(matchReq[1]);

        const matchRev = clean.match(revPattern);
        if (matchRev) semanticRev = parseSingleValue(matchRev[1]);

        let numClean = clean.replace(/\bem\s+\d+\s*(?:x|vezes|parcelas?)\b/gi, '')
                            .replace(/\b\d+\s*(?:x|vezes|parcelas?)\b/gi, '');

        const tokenRegex = /(?:r\$\s*)?\d+(?:[.,]\d+)*(?:\s*(?:mil|k|milh[oõ]es|milh[aã]o|mi))?/gi;
        const rawMatches = numClean.match(tokenRegex) || [];
        const numberTokens = rawMatches.map(parseSingleValue).filter(v => v !== null && v > 0);

        if (semanticReq && semanticRev) {
            return { requestedAmount: semanticReq, revenue: semanticRev };
        }

        if (numberTokens.length >= 2) {
            return {
                requestedAmount: semanticReq || numberTokens[0],
                revenue: semanticRev || numberTokens[1]
            };
        } else if (numberTokens.length === 1) {
            const val = numberTokens[0];
            // 🎯 V31.1: Sem duplicação artificial! Se o usuário digitou 1 número, classifica corretamente
            if (semanticRev && !semanticReq) {
                return { requestedAmount: null, revenue: semanticRev || val };
            } else if (semanticReq && !semanticRev) {
                return { requestedAmount: semanticReq || val, revenue: null };
            } else {
                // Sem indicação semântica explícita: o valor refere-se ao empréstimo solicitado (1º item perguntado)
                return { requestedAmount: val, revenue: null };
            }
        }

        return { requestedAmount: semanticReq, revenue: semanticRev };
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
                const nodeData = (typeof $ === 'function' ? $(name)?.first()?.json : null) || (typeof $node !== 'undefined' && $node[name] ? $node[name].json : null);
                if (nodeData) {
                    textData = (nodeData.strategy || nodeData.extracted_revenue || nodeData.extracted_amount) ? nodeData : (nodeData.output?.[0]?.content?.[0]?.text || nodeData.text || nodeData.message?.content || nodeData.output);
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

    const linkAlreadySent = historyTexts.includes("clicar no link abaixo") || historyTexts.includes("fiservcapital.moneymoneyinvest");

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
    const isSofiaAlreadyFinalized = Boolean(
        lastSofiaMsg.includes("especialistas entrará em contato") ||
        lastSofiaMsg.includes("especialistas entrara em contato") ||
        lastSofiaMsg.includes("estamos quase lá") ||
        lastSofiaMsg.includes("estamos quase la") ||
        lastSofiaMsg.includes("confirmada com sucesso") ||
        lastSofiaMsg.includes("assessores humanos")
    );

    const isSofiaInReforcoCondicoes = !isSofiaAlreadyFinalized && Boolean(
        lastSofiaMsg.includes("clique no botão abaixo para prosseguir") ||
        lastSofiaMsg.includes("clique no botao abaixo para prosseguir") ||
        lastSofiaMsg.includes("ok, entendi") ||
        lastSofiaMsg.includes("dominar o produto") ||
        lastSofiaMsg.includes("detalhes importantes pra você dominar") ||
        lastSofiaMsg.includes("detalhes importantes pra voce dominar") ||
        lastSofiaMsg.includes("linha de capital de giro digital") ||
        lastSofiaMsg.includes("gravame dos seus recebíveis") ||
        lastSofiaMsg.includes("gravame dos seus recebiveis")
    );

    const isSofiaAwaitingConfirmation = !isSofiaAlreadyFinalized && !isSofiaInReforcoCondicoes && Boolean(
        lastSofiaMsg.includes("confirma que deseja prosseguir") || 
        lastSofiaMsg.includes("formalização") || 
        lastSofiaMsg.includes("formalizacao") || 
        lastSofiaMsg.includes("podemos seguir com a formalização") ||
        lastSofiaMsg.includes("podemos seguir com a formalizacao") ||
        lastSofiaMsg.includes("podemos seguir nessas condições") ||
        lastSofiaMsg.includes("podemos seguir nessas condicoes") ||
        lastSofiaMsg.includes("podemos seguir com essa condição") ||
        lastSofiaMsg.includes("podemos seguir com essa condicao") ||
        lastSofiaMsg.includes("condições informadas anteriormente") ||
        lastSofiaMsg.includes("condicoes informadas anteriormente") ||
        lastSofiaMsg.includes("já calculamos a sua simulação") ||
        lastSofiaMsg.includes("ja calculamos a sua simulacao") ||
        lastSofiaMsg.includes("já adiantamos e calculamos") ||
        lastSofiaMsg.includes("ja adiantamos e calculamos") ||
        lastSofiaMsg.includes("prefere simular em outro prazo") ||
        lastSofiaMsg.includes("seguir com a contratação") ||
        lastSofiaMsg.includes("seguir com a contratacao") ||
        lastSofiaMsg.includes("simulação concluída") ||
        lastSofiaMsg.includes("simulacao concluida") ||
        (hasSimulatedInHistory && (
            lastSofiaMsg.includes("podemos seguir com a simulação") ||
            lastSofiaMsg.includes("podemos seguir com a simulacao") ||
            lastSofiaMsg.includes("podemos seguir") || 
            lastSofiaMsg.includes("condições") || 
            lastSofiaMsg.includes("condicoes") ||
            lastSofiaMsg.includes("seguir com") ||
            secondLastSofiaMsg.includes("simulação concluída") ||
            secondLastSofiaMsg.includes("simulacao concluida") ||
            secondLastSofiaMsg.includes("podemos seguir")
        ))
    );

    if (isSofiaAlreadyFinalized) {
        currentStep = 'finalizacao_sucesso';
    } else if (isSofiaInReforcoCondicoes) {
        currentStep = 'reforco_condicoes';
    } else if (isSofiaAwaitingConfirmation) {
        currentStep = 'confirmacao_cliente';
    } else if (!semanticFunnelStep || semanticFunnelStep === 'start' || semanticFunnelStep === 'explicacao_agente') {
        if (isSofiaAlreadyFinalized) {
            currentStep = 'finalizacao_sucesso';
        } else if (isSofiaInReforcoCondicoes || lastSofiaMsg.includes("digite ok para continuar") || lastSofiaMsg.includes("ok, entendi") || lastSofiaMsg.includes("clique no botão abaixo para prosseguir") || lastSofiaMsg.includes("clique no botao abaixo para prosseguir")) {
            currentStep = 'reforco_condicoes';
        } else if (
            lastSofiaMsg.includes("confirma que deseja prosseguir") || 
            lastSofiaMsg.includes("formalização") || 
            lastSofiaMsg.includes("formalizacao") || 
            lastSofiaMsg.includes("podemos seguir com a formalização") ||
            lastSofiaMsg.includes("podemos seguir com a formalizacao") ||
            lastSofiaMsg.includes("podemos seguir nessas condições") ||
            lastSofiaMsg.includes("podemos seguir nessas condicoes") ||
            lastSofiaMsg.includes("podemos seguir com essa condição") ||
            lastSofiaMsg.includes("podemos seguir com essa condicao") ||
            lastSofiaMsg.includes("condições informadas anteriormente") ||
            lastSofiaMsg.includes("condicoes informadas anteriormente") ||
            lastSofiaMsg.includes("já calculamos a sua simulação") ||
            lastSofiaMsg.includes("ja calculamos a sua simulacao") ||
            lastSofiaMsg.includes("já adiantamos e calculamos") ||
            lastSofiaMsg.includes("ja adiantamos e calculamos") ||
            lastSofiaMsg.includes("prefere simular em outro prazo") ||
            lastSofiaMsg.includes("seguir com a contratação") ||
            lastSofiaMsg.includes("seguir com a contratacao") ||
            lastSofiaMsg.includes("simulação concluída") ||
            lastSofiaMsg.includes("simulacao concluida") ||
            (hasSimulatedInHistory && (
                lastSofiaMsg.includes("podemos seguir com a simulação") ||
                lastSofiaMsg.includes("podemos seguir com a simulacao") ||
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
        } else if (isSofiaAlreadyFinalized || lastSofiaMsg.includes("confirmada com sucesso") || lastSofiaMsg.includes("assessores humanos")) {
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
            lastSofiaMsg.includes("vamos fazer uma nova simulação") ||
            lastSofiaMsg.includes("qual o valor exato que você deseja solicitar") ||
            lastSofiaMsg.includes("qual o valor exato") ||
            lastSofiaMsg.includes("qual valor deseja simular") ||
            lastSofiaMsg.includes("valor que deseja simular") ||
            lastSofiaMsg.includes("deseja simular o valor") ||
            lastSofiaMsg.includes("deseja simular") ||
            lastSofiaMsg.includes("excede o seu limite pré-aprovado") ||
            lastSofiaMsg.includes("excede o seu limite pre-aprovado") ||
            lastSofiaMsg.includes("deseja solicitar nessa simulação") ||
            lastSofiaMsg.includes("deseja solicitar nessa simulacao")
        ) {
            currentStep = 'apresenta_ofertas';
        } else if (
            (lastSofiaMsg.includes("valor que deseja solicitar") && lastSofiaMsg.includes("faturamento")) ||
            lastSofiaMsg.includes("valor que deseja solicitar") ||
            lastSofiaMsg.includes("valor desejado para solicitar") ||
            lastSofiaMsg.includes("valor desejado") ||
            lastSofiaMsg.includes("solicitar na análise") ||
            lastSofiaMsg.includes("solicitar na analise") ||
            lastSofiaMsg.includes("valor aproximado você gostaria de solicitar") || 
            lastSofiaMsg.includes("valor aproximado voce gostaria de solicitar") || 
            lastSofiaMsg.includes("qual valor você tem em mente") || 
            lastSofiaMsg.includes("qual valor voce tem em mente") || 
            lastSofiaMsg.includes("valor você tem em mente") || 
            lastSofiaMsg.includes("valor de empréstimo") || 
            lastSofiaMsg.includes("valor mínimo para solicitação") || 
            lastSofiaMsg.includes("valor máximo disponível")
        ) {
            currentStep = 'coleta_valor';
        } else if (
            lastSofiaMsg.includes("faturamento médio mensal atual") || 
            lastSofiaMsg.includes("faturamento médio mensal da sua empresa") || 
            lastSofiaMsg.includes("qual o faturamento") ||
            lastSofiaMsg.includes("qual o faturamento médio mensal") ||
            lastSofiaMsg.includes("faturamento médio mensal aproximado") ||
            (lastSofiaMsg.includes("avaliarmos a melhor proposta") && lastSofiaMsg.includes("faturamento"))
        ) {
            currentStep = 'coleta_faturamento';
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

    let extractedAmount = isRestartSimulation ? null : (semanticAmount || findValueForQuestion(history, ["valor desejado", "solicitar na análise", "solicitar na analise", "valor de empréstimo", "valor de emprestimo", "deseja simular", "valor aproximado você gostaria de solicitar", "valor aproximado voce gostaria de solicitar", "valor que você gostaria de simular", "valor que voce gostaria de simular"]));
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

    // ⚡ Prioridade da mensagem atual (V31: Coleta unificada estilo LP)
    const unifiedExtraction = extractLoanAndRevenue(lastUserLower);
    if (unifiedExtraction.requestedAmount) {
        extractedAmount = unifiedExtraction.requestedAmount;
    }
    if (unifiedExtraction.revenue) {
        revenue = unifiedExtraction.revenue;
    }

    if (!revenue && leadInfo.revenue) {
        revenue = leadInfo.revenue;
    }

    if (currentStep === 'coleta_valor' || currentStep === 'valor_proposta') {
        if (!extractedAmount && fallbackNumber !== null && fallbackNumber >= 1000) {
            extractedAmount = fallbackNumber;
        } else if (!extractedAmount && fallbackNumber > 100) {
            extractedAmount = fallbackNumber;
        } else if (!extractedAmount && fallbackNumber >= 10 && fallbackNumber <= 500) {
            extractedAmount = fallbackNumber * 1000; // Ex: "50" -> 50.000
        }
    } else if (currentStep === 'coleta_faturamento') {
        if (!revenue && extractedAmount) {
            revenue = extractedAmount;
        } else if (!revenue && fallbackNumber !== null && fallbackNumber >= 1000) {
            revenue = fallbackNumber;
        } else if (!revenue && fallbackNumber > 100) {
            revenue = fallbackNumber;
        } else if (!revenue && fallbackNumber >= 5 && fallbackNumber <= 500) {
            revenue = fallbackNumber * 1000; // Ex: "80" -> 80.000
        }

        // 🛡️ V31.1: Na etapa de faturamento, preserva o valor de empréstimo já coletado anteriormente
        if (!/(?:quero|preciso|solicito|empr[eé]stimo|cr[eé]dito)\s*(?:de)?/i.test(lastUserLower)) {
            extractedAmount = leadInfo.requested_amount || findValueForQuestion(history, ["valor desejado", "solicitar na análise", "solicitar na analise", "valor de empréstimo", "valor de emprestimo", "deseja simular"]);
        }
    } else {
        const lastSofiaAskedInstallments = /\b(em quantas parcelas|quantas parcelas|qual o prazo|de 6 a \d{1,2} parcelas)\b/i.test(lastSofiaMsg);
        const lastSofiaAskedAmount = /\b(qual o valor|qual valor|valor exato|valor desejado|deseja solicitar|gostaria de solicitar)\b/i.test(lastSofiaMsg);

        if (lastSofiaAskedInstallments && fallbackNumber >= 6 && fallbackNumber <= 48) {
            extractedInstallments = fallbackNumber;
        } else if (!extractedAmount && fallbackNumber > 100) {
            extractedAmount = fallbackNumber;
        } else if (!extractedAmount && fallbackNumber >= 10 && fallbackNumber <= 500 && !lastUserLower.match(/(?:x|vezes|parcelas)\b/i) && !lastSofiaAskedInstallments) {
            extractedAmount = fallbackNumber * 1000; // Ex: "50" -> 50.000
        }
    }

    // ⚡ Prioridade da mensagem atual para parcelas digitadas diretamente pelo cliente
    let matchCurrentInst = lastUserLower.match(/(?:em\s+)?(\d{1,2})\s*(?:x|vezes|parcelas)\b/i) || lastUserLower.match(/\bem\s+(\d{1,2})\b/i);
    if (matchCurrentInst) {
        let inst = parseInt(matchCurrentInst[1], 10);
        if (inst >= 1 && inst <= 48) {
            extractedInstallments = inst;
        }
    }

    if (!extractedInstallments && fallbackNumber > 0 && fallbackNumber <= 48) {
        const lastSofiaAskedInstallments = /\b(em quantas parcelas|quantas parcelas|qual o prazo|de 6 a \d{1,2} parcelas)\b/i.test(lastSofiaMsg);
        if (lastSofiaAskedInstallments || lastUserLower.match(/(?:x|vezes|parcelas)\b/i)) {
            extractedInstallments = fallbackNumber;
        }
    }

    // 🔄 RECUPERAÇÃO BIDIRECIONAL DE HISTÓRICO: Se usuário informou apenas parcelas, resgata o valor mencionado pela Sofia ou histórico recente
    if (extractedInstallments && !extractedAmount) {
        const mAmountInSofia = lastSofiaMsg.match(/valor de \*?r\$\s*([\d.,]+)/i) || historyTexts.match(/valor de \*?r\$\s*([\d.,]+)/i);
        if (mAmountInSofia) {
            extractedAmount = parseNumber(mAmountInSofia[1].replace(/[.,]+$/, ''));
        }
    }
    // Se usuário informou apenas valor, resgata as parcelas mencionadas na mensagem da Sofia (parcelas ou meses)
    if (extractedAmount && !extractedInstallments) {
        const mInstInSofia = lastSofiaMsg.match(/\*?(\d{1,2})\s*(?:parcelas?|meses)\*?/i) || lastSofiaMsg.match(/prazo (?:[ée]|de) (\d{1,2})/i);
        if (mInstInSofia) {
            const inst = parseInt(mInstInSofia[1], 10);
            if (inst >= 6 && inst <= 48) extractedInstallments = inst;
        }
    }

    if (lastSofiaMsg.includes("excede") && extractedAmount && approvedLimit > 0 && extractedAmount > approvedLimit) {
        extractedAmount = null;
    }

    let requested_amount = isRestartSimulation ? null : (extractedAmount || (leadInfo.requested_amount && (!approvedLimit || leadInfo.requested_amount <= approvedLimit) ? leadInfo.requested_amount : null));
    let requested_installments = isRestartSimulation ? null : (extractedInstallments || leadInfo.requested_installments);
    if (requested_installments > 48) {
        requested_installments = null;
    }
    if (requested_amount && requested_amount < 1000) requested_amount = null;
    if (isPreApprovedJourney && (!requested_amount || requested_amount < 1000)) {
        requested_amount = leadInfo.requested_amount || 50000;
    }

    // --- 2) INTENÇÕES (REGEX + SEMÂNTICA HÍBRIDA) ---
    const isAgentButtonClick = currentStep !== 'confirmacao_cliente' && /^(falar com um agente!?|falar com agente \(ia\)|dúvidas – falar agente)$/i.test(lastUserLower.trim());

    const isSelfSimulationRequest =
        /\b(simular?|simula[çc][ãa]o)\b/i.test(lastUserLower) &&
        /\b(vc|voc[eê]|tu|pra mim|por mim|para mim|me faz|poderia|consegue|conseguiria|faz(er)? (para |pra |por )?mim|faz (voc[eê]|vc))(?![a-z0-9])/i.test(lastUserLower);

    const isLinkRequest = !isSelfSimulationRequest && !isRestartSimulation && (
        /\b(simular?|simula[çc][ãa]o|quanto posso ter|quanto posso pegar)\b/i.test(lastUserLower) ||
        (isButtonTemplateClick && !isAgentButtonClick) ||
        (/\b(quero|manda|mande|envia|passa|passe|pode|me d[áa]|mandar)\b/i.test(lastUserLower) && /\b(link|simul|proposta|an[áa]lise)\b/i.test(lastUserLower)) ||
        (/^link$/i.test(lastUserLower)) ||
        semanticIntent === "SIMULATION_REQUEST"
    );

    const isOptInAccepted = (
        (/\b(autorizo|sim,?\s*autorizo|sim|concordo|aceito|de acordo|ok)\b/i.test(lastUserLower) && !/\b(n[ãa]o)\b/i.test(lastUserLower)) &&
        (currentStep === 'consentimento_optin' || semanticIntent === "OPTIN_ACCEPTED" || lastUserLower.includes("autorizo") || currentStep === 'start' || currentStep === 'explicacao_agente' || currentStep === 'coleta_valor')
    ) || semanticIntent === "OPTIN_ACCEPTED" || lastUserLower.includes("sim, autorizo") || lastUserLower.includes("sim autorizo") || lastUserLower.includes("optin_sim") || (currentStep === 'consentimento_optin' && /^(ok|sim|autorizo|positivo|de acordo|concordo|aceito)$/i.test(lastUserLower.trim()));

    const isAffirmative = ((/\b(s[ií]+m+|pode|manda|mande|envia|bora|aceito|ok|beleza|correto|certo|confirm[ao]|show|com certeza|isso|exato|exatamente|claro|positivo|verdade|de acordo|fechou|ok, entendi|entendi|falar\s+(?:com\s+)?(?:o\s+)?(?:um\s+)?especialista|falar especialista)\b/i.test(lastUserLower) || isLinkRequest) && !/\b(n[ãa]o|como|como assim)\b/i.test(lastUserLower) || ["VERIFY_IDENTITY"].includes(semanticIntent)) && !isRestartSimulation;
    const isNegative = /\b(não|nao|negativo|parar|cancelar|não quero|nem pensar|jamais|agora não|agora nao|deixa pra depois|sem interesse|não tenho interesse|nao tenho interesse|não preciso|nao preciso|desisto|não vou querer|nao vou querer)\b/i.test(lastUserLower);
    const isHesitation = /\b(vou\s+(analisar|pensar|ver|verificar|avaliar|consultar|conversar)|deixa\s+(eu\s+)?ver|vou\s+falar\s+com|vou\s+ver\s+com|dar\s+uma\s+olhada|analisando|pensando)\b/i.test(lastUserLower) || semanticIntent === "WAIT_AND_RETURN";
    const asksForSimulation = /\b(simular?|simula[çc][ãa]o|outr[oa]|mudar|alterar|recalcular|novamente|vezes|parcelas?)\b/i.test(lastUserLower);

    const isSofiaAtDisposal = Boolean(
        lastSofiaMsg.includes("disposição") || 
        lastSofiaMsg.includes("disposicao") || 
        lastSofiaMsg.includes("é só me avisar") || 
        lastSofiaMsg.includes("e so me avisar") ||
        lastSofiaMsg.includes("caso queira simular") ||
        lastSofiaMsg.includes("surgir alguma dúvida") ||
        lastSofiaMsg.includes("surgir alguma duvida")
    );

    const isCourtesyAck = /^(certo|ok|blz|beleza|combinado|t[aá] bom|t[aá] bem|perfeito|obrigad[ao]|valeu|show|entendi|entendido|tranquilo|combinado ent[aã]o|fechado|grato|maravilha)[!.,\s]*$/i.test(lastUserLower.trim());

    const isSofiaAlreadyConcluded = Boolean(
        lastSofiaMsg.includes("tenha um ótimo dia") || 
        lastSofiaMsg.includes("tenha um otimo dia") || 
        lastSofiaMsg.includes("conte comigo quando precisar") ||
        lastSofiaMsg.includes("fico por aqui à disposição") ||
        lastSofiaMsg.includes("fico por aqui a disposicao")
    );

    // Reconhecimento de divergência de CNPJ no input do usuário
    const isCnpjDivergent = /\b(n[aã]o [eé] (meu|minha|esse|este)|cnpj (errado|n[aã]o [eé]|outro|diferente|incorreto)|n[aã]o sou|outra empresa|trocou|empresa errada|n[aã]o perten[cç]o)\b/i.test(lastUserLower) || semanticIntent === "CNPJ_BLOCKED";

    // 🎯 V31.1: Identifica se o usuário está enviando um valor numérico de faturamento ou empréstimo (NÃO é dúvida)
    const isFaturamentoAnswer = Boolean(unifiedExtraction.revenue || /\bfaturamento\s*(?:de|é|e|em torno de)?\s*r?\$?\s*\d+/i.test(lastUserLower));
    const isAmountAnswer = Boolean(unifiedExtraction.requestedAmount || (extractedAmount && extractedAmount > 0) || /^(?:r\$\s*)?\d+(?:[.,]\d+)*(?:\s*(?:mil|k))?$/i.test(lastUserLower.trim()));
    const isNumericAnswer = isFaturamentoAnswer || isAmountAnswer;

    const regexDoubt = (
        /\b(dúvida|duvida|como|como assim|como funciona|saber mais|explica|entender|oque é|o que é|golpe|seguro|fraude|confiável|taxa|juros|bmp|banco|garantia|prazo|boleto|cartão|cartao|cartões|cartoes|só no cartão|so no cartao|crédito|credito|débito|debito|falar com um agente|porque|objetivo|garantias|quem é você|quem e voce|você é bot|voce e bot|é um robô|e um robo|portal|senha|login|cadastrais|cadastro|maquininha|filiação|filiaca|endereço|endereco|cnae|pat|dirf|rendimentos|assistência|assistencia|chaveiro|eletricista|encanador|reembolso|corte|antecipação|antecipacao|contrato|anuidade|tarifa|adesão|adesao|mensalidade)\b/i.test(lastUserLower) ||
        /\b(o que é|como funciona|como comprovar|precisa comprovar)\s+faturamento\b/i.test(lastUserLower) ||
        /^cart[aã]o\??$/i.test(lastUserLower.trim())
    ) && !isNumericAnswer;

    const isDoubt = (regexDoubt || ["EXACT_FAQ", "DYNAMIC_FAQ", "INSTITUTIONAL_FAQ", "DOUBT"].includes(semanticIntent)) && !isNumericAnswer;

    const regexHuman = /\b(atendimento|falar com|conversar com|passar para|chamar|quero|preciso|transferir|conectar|tem como)\b.*\b(humano|persona|atendente|atensente|vendedor|algu[ée]m|especialista|assessor|operador|consultor|fone|telefone|ligar|ligação|gente|pessoa de verdade|humano de verdade)\b/i.test(lastUserLower) || 
        /\b(me\s+liga|me\s+ligue|pode\s+ligar|liga\s+pra\s+mim|me\s+telefona|pode\s+me\s+ligar|favor\s+ligar)\b/i.test(lastUserLower) ||
        /^(atendente|atensente|assessor|humano|pessoa|fone|telefone|ligar)$/i.test(lastUserLower.trim());
    const isHumanRequest = (regexHuman || semanticIntent === "HUMAN_HANDOFF" || isCnpjDivergent) && !isAgentButtonClick;

    // 🎯 RECONHECIMENTO DE INTENÇÃO / BOTÃO "FALAR ESPECIALISTA"
    const regexTalkToSpecialist = /\b(falar\s+(?:com\s+)?(?:o\s+)?(?:um\s+)?(?:consultor|especialista|assessor|vendedor|atendente)|falar\s+especialista|chamar\s+especialista|quero\s+especialista|atendimento\s+humano)\b/i;
    const isTalkToSpecialist = (
        regexTalkToSpecialist.test(lastUserLower) ||
        /^(falar\s+especialista|falar\s+com\s+especialista|especialista|consultor|atendente|falar com especialista!?)$/i.test(lastUserLower.trim()) ||
        (isButtonTemplateClick && /especialista/i.test(lastUserLower)) ||
        lastUserLower.includes("falar especialista") ||
        lastUserLower.includes("falar com especialista")
    ) && !isAgentButtonClick;

    const isFarewell = !lastUserLower.includes("ok, entendi") && !lastUserLower.includes("ok entendi") && /\b(obrigado|obrigada|vlw|valeu|entendido|entendi|tchau|at[ée] logo|por enquanto [ée] s[óo]|nada mais|encerrar|show)\b/i.test(lastUserLower);
    const isGreeting = /^(oi|ol[aá]|bom dia|boa tarde|boa noite|oie|opa)$/i.test(lastUserLower);

    // 🛡️ DETECÇÃO DE TOM AGRESSIVO, OFENSAS E INSULTOS (PRIORIDADE ALTA NA FILA DE ATENDIMENTO)
    const regexOffensiveOrAggressive = /\b(idiota|idiotas|imbecil|imbecis|babaca|babacas|burro|burros|palhaço|palhaco|palhaçada|palhacada|safado|safados|sem vergonha|mentiroso|mentirosos|canalha|canalhas|otário|otario|otários|otarios|ridículo|ridiculo|trouxa|trouxas|farsante|golpe|golpistas|estelionato|estelionatário|processo|processar|vou processar|advogado|procon|policia|polícia|denúncia|denuncia|denunciar|porra|caralho|merda|pqp|fdp|fode|foder|foda-se|fodase|vsf|vtmnc|vtnc|cacete|desgraça|desgraca|lixo)\b/i.test(lastUserLower) || /\b(por que mandou|pq mandou|pra que mandar)\b/i.test(lastUserLower);
    const isOffensiveOrAggressive = regexOffensiveOrAggressive;

    const regexComplaint = (/\b(atraso|problema|errado|reclamação|ruim|péssimo|horrível|lixo|merda|falha|não funciona|nao funciona|está ruim|está péssimo)\b/i.test(lastUserLower) || (/\b(n[ãa]o recebi|nao recebi)\b/i.test(lastUserLower) && !/reembolso/i.test(lastUserLower)));
    const isComplaint = regexComplaint || isOffensiveOrAggressive || semanticIntent === "COMPLAINT" || semanticIntent === "COMPLAINT_RECOVERY";

    const checkIfComplaint = (msgText) => {
        const textLower = String(msgText || "").toLowerCase();
        return (/\b(atraso|problema|errado|reclamação|ruim|péssimo|horrível|lixo|merda|falha|não funciona|nao funciona|está ruim|está péssimo)\b/i.test(textLower) || (/\b(n[ãa]o recebi|nao recebi)\b/i.test(textLower) && !/reembolso/i.test(textLower)) || regexOffensiveOrAggressive);
    };

    const previousClientComplaints = history
        .filter(m => !['assistant', 'bot', 'agent', 'ai', 'outbound'].includes(String(m.sender_type || m.role || m.sender || m.direction).toLowerCase()))
        .filter(m => checkIfComplaint(m.content || m.text));

    const isFirstComplaint = previousClientComplaints.length === 0;
    const effectiveComplaint = (isComplaint && !isFirstComplaint) || isOffensiveOrAggressive;

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

    // --- 4) TRANSIÇÕES DE ESTADO (V30.2: DETECÇÃO ESTRITA DE NÚMEROS DA MENSAGEM ATUAL) ---
    let nextStep = currentStep;
    let transitionApplied = false;

    const userTypedInstallmentsInCurrentMsg = Boolean(
        lastUserLower.match(/(?:em\s+)?(\d{1,2})\s*(?:x|vezes|parcelas)\b/i) || 
        lastUserLower.match(/\bem\s+(\d{1,2})\b/i) ||
        (Boolean(semanticInstallments) && semanticInstallments > 0)
    );

    const userTypedAmountInCurrentMsg = Boolean(
        (fallbackNumber !== null && fallbackNumber >= 1000) ||
        (fallbackNumber !== null && fallbackNumber >= 10 && fallbackNumber <= 500 && !lastUserLower.match(/(?:x|vezes|parcelas)\b/i)) ||
        (Boolean(semanticAmount) && semanticAmount > 0)
    );

    const userTypedNewNumbers = (fallbackNumber !== null && fallbackNumber > 0) || userTypedInstallmentsInCurrentMsg || userTypedAmountInCurrentMsg;

    const isSofiaAtDisposalAck = isSofiaAtDisposal && (isCourtesyAck || isFarewell) && !asksForSimulation && !userTypedNewNumbers && !isDoubt;

    // 🛡️ BLINDAGEM ANTI-ECO DE CORTESIAS / ENCERRAMENTO JÁ CONCLUÍDO
    if (isSofiaAlreadyConcluded && (isCourtesyAck || isFarewell) && !isDoubt && !asksForSimulation && !userTypedNewNumbers) {
        return {
            currentStep: "stop_flow",
            stop_flow: true,
            trigger_handoff: false,
            reason: "Atendimento já concluído cordialmente. Eco prevenido.",
            conversation_id: rpcData.conversation?.id || rpcData.p_conversation_id,
            p_conversation_id: rpcData.conversation?.id || rpcData.p_conversation_id
        };
    }

    // 🎯 PRIORIDADE MÁXIMA: BOTÃO OU INTENÇÃO "FALAR ESPECIALISTA"
    // Ao clicar em "Falar Especialista" (ou solicitar especialista após ter limite, proposta ou simulação),
    // transiciona IMEDIATAMENTE para 'finalizacao_sucesso' com trigger_handoff = true para inclusão no Cockpit de Vendas.
    const hasEligibilityForSpecialist = Boolean(
        hasSimulatedInHistory || 
        isApprovedFiserv || 
        leadInfo.simulation_data || 
        approvedLimit > 0 || 
        hasActiveLoan ||
        ['apresenta_ofertas', 'confirmacao_cliente', 'solicitar_simulacao', 'reforco_condicoes'].includes(currentStep)
    );

    if (isTalkToSpecialist && hasEligibilityForSpecialist) {
        nextStep = (currentStep === 'reforco_condicoes') ? 'finalizacao_sucesso' : 'reforco_condicoes';
        transitionApplied = true;
    } else if (isAgentButtonClick && currentStep !== 'confirmacao_cliente') {
        nextStep = 'explicacao_agente';
        transitionApplied = true;
    } else if (currentStep === 'start') {
        if (leadInfo.is_lead === false) {
            nextStep = 'start';
            transitionApplied = true;
        } else {
            const isPureGreetingWithoutPitch = isGreeting && assistantMessages.length === 0;
            if (!isNegative && !isDoubt && !isPureGreetingWithoutPitch) {
                if (isPreApprovedJourney && leadInfo.pre_approved_amount) {
                    nextStep = 'apresenta_ofertas';
                } else if (hasSimulatedInHistory) {
                    nextStep = 'reforco_condicoes';
                } else if ((hasActiveLoan || isApprovedFiserv) && leadInfo.pre_approved_amount) {
                    nextStep = 'apresenta_ofertas';
                } else if (hasPriorOptIn && leadInfo.pre_approved_amount) {
                    nextStep = hasActiveLoan ? 'apresenta_ofertas' : 'criar_lead';
                } else if (requested_amount && requested_amount > 0) {
                    nextStep = (revenue && revenue > 0) ? (hasPriorOptIn ? (hasActiveLoan ? 'apresenta_ofertas' : 'criar_lead') : 'consentimento_optin') : 'coleta_faturamento';
                } else {
                    nextStep = 'coleta_valor';
                }
                transitionApplied = true;
            }
        }
    } else if (currentStep === 'explicacao_agente') {
        const hasExplicitNumbers = (requested_amount && requested_amount > 0) || userTypedNewNumbers;
        if ((isAffirmative || hasExplicitNumbers) && !isDoubt) {
            if (isPreApprovedJourney && leadInfo.pre_approved_amount) {
                nextStep = 'apresenta_ofertas';
            } else if (hasSimulatedInHistory) {
                nextStep = 'reforco_condicoes';
            } else if ((hasActiveLoan || isApprovedFiserv) && leadInfo.pre_approved_amount) {
                nextStep = 'apresenta_ofertas';
            } else if (hasPriorOptIn && leadInfo.pre_approved_amount) {
                nextStep = hasActiveLoan ? 'apresenta_ofertas' : 'criar_lead';
            } else if (requested_amount && requested_amount > 0) {
                nextStep = (revenue && revenue > 0) ? (hasPriorOptIn ? (hasActiveLoan ? 'apresenta_ofertas' : 'criar_lead') : 'consentimento_optin') : 'coleta_faturamento';
            } else {
                nextStep = 'coleta_valor';
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
                    nextStep = 'coleta_valor';
                }
            } else {
                nextStep = 'coleta_valor';
            }
            transitionApplied = true;
        } else if (isNegative && !isDoubt) {
            nextStep = 'coleta_cnpj_correto';
            transitionApplied = true;
        } else if (semanticIntent === "CNPJ_BLOCKED") {
            nextStep = 'coleta_cnpj_correto';
            transitionApplied = true;
        }
    } else if (currentStep === 'coleta_valor') {
        if (isCnpjDivergent) {
            nextStep = 'coleta_cnpj_correto';
            transitionApplied = true;
        } else if (requested_amount && requested_amount >= 10000 && requested_amount <= 500000 && !isDoubt) {
            // 🎯 V31 Jornada Unificada (LP): Se coletou valor e já tem faturamento (ou preenchido por fallback de 1 valor), avança direto para o opt-in!
            if (revenue && revenue > 0) {
                nextStep = hasPriorOptIn ? (hasActiveLoan ? 'apresenta_ofertas' : 'criar_lead') : 'consentimento_optin';
            } else {
                nextStep = 'coleta_faturamento';
            }
            transitionApplied = true;
        } else if (isNegative && !isDoubt) {
            nextStep = 'desistencia_cliente';
            transitionApplied = true;
        } else {
            nextStep = 'coleta_valor';
            transitionApplied = true;
        }
    } else if (currentStep === 'coleta_faturamento') {
        if (isCnpjDivergent) {
            nextStep = 'coleta_cnpj_correto';
            transitionApplied = true;
        } else if (revenue && revenue > 0 && !isDoubt) {
            nextStep = hasPriorOptIn ? (hasActiveLoan ? 'apresenta_ofertas' : 'criar_lead') : 'consentimento_optin';
            transitionApplied = true;
        } else if (isNegative && !isDoubt) {
            nextStep = 'desistencia_cliente';
            transitionApplied = true;
        } else {
            nextStep = 'coleta_faturamento';
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
        if (isTalkToSpecialist) {
            nextStep = 'reforco_condicoes';
            transitionApplied = true;
        } else if (isSofiaAtDisposalAck) {
            nextStep = 'confirmacao_cliente';
            transitionApplied = true;
        } else if (isHesitation) {
            nextStep = hasSimulatedInHistory ? 'confirmacao_cliente' : 'apresenta_ofertas';
            transitionApplied = false;
        } else if (isRestartSimulation) {
            requested_amount = null;
            requested_installments = null;
            nextStep = 'apresenta_ofertas';
            transitionApplied = true;
        } else if (userTypedNewNumbers || asksForSimulation || isAffirmative) {
            if (requested_amount && !requested_installments) {
                requested_installments = leadInfo.installments || leadInfo.max_installments || leadInfo.approved_installments || leadInfo.pre_approved_term || 24;
            } else if (!requested_amount && requested_installments) {
                requested_amount = leadInfo.requested_amount || approvedLimit || 50000;
            }

            if (approvedLimit > 0 && requested_amount && requested_amount > approvedLimit) {
                nextStep = 'apresenta_ofertas';
                transitionApplied = true;
            } else if (requested_installments && requested_amount && !isDoubt) {
                nextStep = 'solicitar_simulacao';
                transitionApplied = true;
            } else {
                nextStep = 'apresenta_ofertas';
            }
        } else if (isNegative && !isDoubt) {
            nextStep = 'desistencia_cliente';
            transitionApplied = true;
        } else {
            nextStep = 'apresenta_ofertas';
        }
    } else if (currentStep === 'solicitar_simulacao' || currentStep === 'confirmacao_cliente') {
        const hasNewNumbers = userTypedNewNumbers;

        if (isTalkToSpecialist) {
            nextStep = 'reforco_condicoes';
            transitionApplied = true;
        } else if (isRestartSimulation) {
            requested_amount = null;
            requested_installments = null;
            nextStep = 'apresenta_ofertas';
            transitionApplied = true;
        } else if (isSofiaAtDisposalAck) {
            nextStep = 'confirmacao_cliente';
            transitionApplied = true;
        } else if (isHesitation && currentStep === 'confirmacao_cliente') {
            nextStep = 'confirmacao_cliente';
            transitionApplied = false;
        } else if (currentStep === 'confirmacao_cliente' && isAffirmative && !isDoubt && !asksForSimulation && !isRestartSimulation) {
            if (hasSimulatedInHistory || (requested_amount && requested_installments) || leadInfo.simulation_data) {
                nextStep = 'reforco_condicoes';
            } else if (isPreApprovedJourney && leadInfo.pre_approved_amount) {
                nextStep = 'apresenta_ofertas';
            } else if (requested_amount && requested_amount > 0) {
                nextStep = (revenue && revenue > 0) ? (hasPriorOptIn ? (hasActiveLoan ? 'apresenta_ofertas' : 'criar_lead') : 'consentimento_optin') : 'coleta_faturamento';
            } else {
                nextStep = 'coleta_valor';
            }
            transitionApplied = true;
        } else if ((hasNewNumbers || asksForSimulation) && !isHesitation) {
            // Se informou valor mas não disse parcelas (ou vice-versa), completa com o padrão do produto (24x)
            if (requested_amount && !requested_installments) {
                requested_installments = leadInfo.installments || leadInfo.max_installments || leadInfo.approved_installments || leadInfo.pre_approved_term || 24;
            } else if (!requested_amount && requested_installments) {
                requested_amount = leadInfo.requested_amount || approvedLimit || 50000;
            }

            if (approvedLimit > 0 && requested_amount && requested_amount > approvedLimit) {
                nextStep = 'apresenta_ofertas';
                transitionApplied = true;
            } else if (requested_amount && requested_installments && (hasNewNumbers || asksForSimulation)) {
                nextStep = 'solicitar_simulacao';
                transitionApplied = true;
            } else {
                requested_amount = null;
                requested_installments = null;
                nextStep = 'apresenta_ofertas';
                transitionApplied = true;
            }
        } else if (isAffirmative && !isDoubt) {
            if (hasSimulatedInHistory || (requested_amount && requested_installments) || leadInfo.simulation_data) {
                nextStep = 'reforco_condicoes';
            } else if (isPreApprovedJourney && leadInfo.pre_approved_amount) {
                nextStep = 'apresenta_ofertas';
            } else if (requested_amount && requested_amount > 0) {
                nextStep = (revenue && revenue > 0) ? (hasPriorOptIn ? (hasActiveLoan ? 'apresenta_ofertas' : 'criar_lead') : 'consentimento_optin') : 'coleta_faturamento';
            } else {
                nextStep = 'coleta_valor';
            }
            transitionApplied = true;
        } else if (isNegative && !isDoubt) {
            nextStep = currentStep === 'confirmacao_cliente' ? 'desistencia_cliente' : 'apresenta_ofertas';
            transitionApplied = true;
        } else {
            nextStep = currentStep;
        }
    } else if (currentStep === 'reforco_condicoes') {
        if (isTalkToSpecialist || (isAffirmative && !isDoubt)) {
            if (hasSimulatedInHistory || (requested_amount && requested_installments) || leadInfo.simulation_data) {
                nextStep = 'finalizacao_sucesso';
            } else if (isPreApprovedJourney && leadInfo.pre_approved_amount) {
                nextStep = 'apresenta_ofertas';
            } else {
                nextStep = 'coleta_valor';
            }
            transitionApplied = true;
        } else if (isDoubt) {
            nextStep = 'reforco_condicoes';
        } else {
            nextStep = 'reforco_condicoes';
            transitionApplied = true;
        }
    } else if (currentStep === 'finalizacao_sucesso') {
        nextStep = 'finalizacao_sucesso';
        transitionApplied = true;
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
        } else if (requested_amount && requested_amount > 0) {
            nextStep = (revenue && revenue > 0) ? (hasPriorOptIn ? (hasActiveLoan ? 'apresenta_ofertas' : 'criar_lead') : 'consentimento_optin') : 'coleta_faturamento';
        } else {
            nextStep = 'coleta_valor';
        }
        transitionApplied = true;
    }

    // 🛡️ BLINDAGEM ZERO-C: SE JORNADA PRÉ-APROVADA, NUNCA REGREDIR PARA ETAPAS CADASTRAIS
    if (isPreApprovedJourney && ['verificacao_cnpj', 'coleta_cnpj_correto', 'coleta_faturamento', 'coleta_valor', 'consentimento_optin'].includes(nextStep)) {
        nextStep = 'apresenta_ofertas';
        transitionApplied = true;
    }

    // 🛡️ BLINDAGEM ZERO-D: NENHUM LEAD PODE AVANÇAR PARA FORMALIZAÇÃO OU REFORÇO SEM OPT-IN VÁLIDO
    if (['finalizacao_sucesso', 'reforco_condicoes', 'confirmacao_cliente'].includes(nextStep) && !isPreApprovedJourney && !hasPriorOptIn && !isOptInAccepted && !hasSimulatedInHistory) {
        if (requested_amount && requested_amount > 0) {
            nextStep = (revenue && revenue > 0) ? 'consentimento_optin' : 'coleta_faturamento';
        } else {
            nextStep = 'coleta_valor';
        }
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

    // 🛡️ BLINDAGEM 2-B: CONTRA SIMULAÇÃO ACIMA DO LIMITE PRÉ-APROVADO (EVITA HTTP 422 DA FISERV)
    if (nextStep === 'solicitar_simulacao' && approvedLimit > 0 && requested_amount && requested_amount > approvedLimit) {
        nextStep = 'apresenta_ofertas';
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
    if (leadInfo.is_lead === false || (transitionApplied && !isDoubt) || isAgentButtonClick || isHumanRequest || isTalkToSpecialist || nextStep === 'finalizacao_sucesso' || isLinkIssue || effectiveComplaint || isDeniedFiserv || isCnpjDivergent) {
        mode = "parrot";
    }
    if ((isDoubt || (isFarewell && !isSofiaAtDisposalAck)) && !isAgentButtonClick && !isHumanRequest && !isLinkIssue && leadInfo.is_lead !== false && !isDeniedFiserv && !isCnpjDivergent) {
        mode = "consultive";
    }
    if (isSelfSimulationRequest && leadInfo.is_lead !== false && !isDeniedFiserv) {
        mode = "consultive";
    }

    if ((nextStep === 'apresenta_ofertas' || nextStep === 'confirmacao_cliente') && mode === 'parrot' && !isSofiaAtDisposalAck) {
        mode = 'consultive';
    }

    // --- 6) PROMPT FINAL ---
    let activeConfig = blueprint.steps[nextStep] || blueprint.steps["start"];
    if (isAgentButtonClick) activeConfig = blueprint.steps["explicacao_agente"];

    let forcedText = String(activeConfig?.rules || "");

    if (leadInfo.is_lead === false) {
        const hasPriorUnaccreditedNotice = assistantMessages.some(m => {
            const text = String(m.content || m.text || '').toLowerCase();
            return text.includes('não possui um credenciamento ativo') || 
                   text.includes('nao possui um credenciamento ativo') || 
                   text.includes('4004-2233');
        });

        if (hasPriorUnaccreditedNotice) {
            const isPureAckOrFarewell = isCourtesyAck || isFarewell || /^(s[ií]+m+|ok|beleza|combinado|certo|perfeito|entendi|t[aá] bom|valeu)[!.,\s]*$/i.test(lastUserLower);
            if (isPureAckOrFarewell) {
                forcedText = `Combinado! Assim que o seu credenciamento for realizado com a Central da Ticket (*11 4004-2233*), estaremos à total disposição para a sua análise de crédito por aqui. Tenha um ótimo dia! 👍`;
            } else {
                forcedText = `Como você ainda não possui credenciamento ativo na Ticket, as adesões e consultas são feitas exclusivamente pela nossa Central de Atendimento no WhatsApp *11 4004-2233* ou pelo link https://wa.me/551140042233. Assim que concluir o credenciamento, me chame aqui!`;
            }
        } else {
            forcedText = `Olá${leadInfo.name ? ', *' + leadInfo.name + '*' : ''}! Tudo bem?\n\nNotei aqui que você ainda não possui um credenciamento ativo ou seus dados não constam na nossa base de ofertas pré-aprovadas no momento.\n\nPara realizar o seu credenciamento e ter acesso às nossas soluções de crédito e benefícios da Ticket, envie uma mensagem pelo WhatsApp para a nossa Central no número *11 4004-2233* ou acesse diretamente o link https://wa.me/551140042233.\n\nAssim que estiver tudo certinho, estarei por aqui!`;
        }
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
        } else if (isCnpjDivergent || /\b(chat errado|conversa errada|conversas diferentes|chats diferentes|papos diferentes|lugar errado|n[uú]mero errado|numero errado|outra empresa)\b/i.test(lastUserLower)) {
            forcedText = `Compreendi perfeitamente. Registrei aqui o encerramento do contato para que você não volte a receber novas mensagens desta campanha. Tenha um ótimo dia! 👍`;
            nextStep = "stop_flow";
            mode = "parrot";
        } else {
            forcedText = `Claro, entendo.\n\nVou solicitar para que um assessor entre em contato com você pelo WhatsApp em até *2 dias úteis* e siga com o seu atendimento.\n\nEnquanto isso, se quiser tirar alguma dúvida pontual por aqui, estou à disposição.`;
        }
    } else if (effectiveComplaint) {
        forcedText = `Certo, entendo perfeitamente sua frustração. Sinto muito que sua experiência atual esteja sendo assim.\n\nComo você mencionou esse problema, vou priorizar o seu contato com um de nossos consultores humanos para que ele verifique isso detalhadamente antes de qualquer outra coisa.\n\nVocê gostaria de falar sobre mais algum ponto específico antes do nosso especialista entrar em contato?`;
    } else if (nextStep === 'start' && !isDeniedFiserv) {
        mode = "parrot";
        if (isStrictGreeting) {
            forcedText = `Olá! Bom dia! Sou a Sofia, especialista da Ticket.\n\nVocê pode ter de *R$ 10 mil a R$ 500 mil* em Capital de Giro usando suas vendas futuras Ticket como garantia. O dinheiro cai na conta em até 24h e as taxas são a partir de *1,89% a.m.*\n\n👉 Gostaria de fazer uma simulação sem burocracia ou prefere falar com um especialista?`;
        } else {
            forcedText = `Já pensou em reforçar o caixa sem burocracia?\n\nVocê pode ter até *R$ 500 mil* disponíveis, usando apenas seus recebíveis Ticket como garantia. A consulta é rápida e sem compromisso.\n\n✅ Taxas a partir de *1,89% a.m*;\n✅ Crédito disponível entre *10 mil a 500 mil reais*;\n✅ Recebimento do dinheiro em até *24h*;\n\n👉 Gostaria de fazer uma simulação sem compromisso aqui mesmo pelo WhatsApp ou ficou com alguma dúvida?`;
        }
    } else if (nextStep === 'explicacao_agente') {
        forcedText = `Olá! Sou a Sofia, especialista da *Ticket*. Que bom que você quer saber mais!\n\nExplicando rapidamente: este é um reforço de caixa exclusivo para parceiros Ticket. Você pode ter de *R$ 10 mil a R$ 500 mil* com taxas a partir de *1,89% a.m.* O dinheiro cai na sua conta em até *24h* e o pagamento é feito via boleto bancário, sem comprometer seu limite de crédito.\n\n👉 Gostaria de fazer uma simulação do valor exato aqui mesmo pelo WhatsApp agora ou prefere tirar alguma dúvida antes? 📈`;
    } else if (nextStep === 'coleta_valor') {
        if (currentStep === 'coleta_valor') {
            let loanNum = parseNumber(lastUserLower);
            if (loanNum !== null && loanNum >= 10 && loanNum <= 500 && !lastUserLower.match(/(?:x|vezes|parcelas)\b/i)) {
                loanNum = loanNum * 1000;
            }
            if (loanNum !== null && loanNum < 10000) {
                forcedText = `O valor mínimo para solicitação de crédito é de *R$ 10.000,00* (e até R$ 500 mil).\n\nQual valor você gostaria de solicitar nessa análise e o seu faturamento médio mensal?\n\n_Ex.: *50 mil e 80 mil*_`;
            } else if (loanNum !== null && loanNum > 500000) {
                forcedText = `O valor máximo disponível para essa linha é de *R$ 500.000,00*.\n\nQual valor até esse limite você gostaria de solicitar e o seu faturamento médio mensal?\n\n_Ex.: *50 mil e 80 mil*_`;
            } else if (lastSofiaMsg.includes("faturamento médio mensal") || lastSofiaMsg.includes("valor que deseja solicitar") || lastSofiaMsg.includes("valor desejado")) {
                forcedText = `Por favor, me informe o valor desejado para a análise de crédito e o faturamento médio mensal da sua empresa.\n\n_Ex.: *50 mil e 80 mil*_`;
            } else if (revenue && revenue > 0 && (!requested_amount || requested_amount <= 0)) {
                const revFmt = Number(revenue).toLocaleString('pt-BR');
                forcedText = `Perfeito! Registrei o faturamento de *R$ ${revFmt}* da sua empresa.\n\nAgora, por favor, me informe o *valor que deseja solicitar* de empréstimo (de R$ 10 mil a R$ 500 mil).\n\n_Exemplo: 50 mil_`;
            } else {
                forcedText = `Perfeito! Para avaliarmos a melhor condição disponível para sua empresa, me informe por favor o *valor que deseja solicitar* e o seu *faturamento médio mensal*.\n\n_Exemplo: 50 mil e 80 mil_`;
            }
        } else {
            if (revenue && revenue > 0 && (!requested_amount || requested_amount <= 0)) {
                const revFmt = Number(revenue).toLocaleString('pt-BR');
                forcedText = `Perfeito! Registrei o faturamento de *R$ ${revFmt}* da sua empresa.\n\nAgora, por favor, me informe o *valor que deseja solicitar* de empréstimo (de R$ 10 mil a R$ 500 mil).\n\n_Exemplo: 50 mil_`;
            } else {
                // 🎯 V31 Oficial Ticket: Pergunta Unificada estilo Landing Page (LP)
                forcedText = `Perfeito! Para avaliarmos a melhor condição disponível para sua empresa, me informe por favor o *valor que deseja solicitar* e o seu *faturamento médio mensal*.\n\n_Exemplo: 50 mil e 80 mil_`;
            }
        }
        if (!isDoubt) mode = "parrot";
    } else if (nextStep === 'coleta_faturamento') {
        const isCartaoQuestion = /\b(cart[aã]o|cart[oõ]es|s[oó] no cart[aã]o|maquininha|total|geral)\b/i.test(lastUserLower) || /^cart[aã]o\??$/i.test(lastUserLower.trim());
        const isMuchMore = /\b(muito mais|bem mais|bastante|muito acima|alto|mais que isso|acima de|mais de|depende|n[aã]o sei exato|varia|n[aã]o sei)\b/i.test(lastUserLower);
        const alreadyAskedFaturamento = lastSofiaMsg.includes("faturamento médio mensal") || lastSofiaMsg.includes("faturamento aproximado") || lastSofiaMsg.includes("qual o faturamento");

        if (isCartaoQuestion) {
            forcedText = `Pode ser o *faturamento total* da sua empresa (incluindo vendas no cartão, Pix, boletos, etc.). Uma média aproximada já é suficiente para a nossa simulação!\n\nLembrando que o pagamento do empréstimo é feito mensalmente via *Boleto Bancário*, sem desconto direto das suas vendas diárias de cartão.\n\nQual seria o faturamento médio mensal aproximado para seguirmos?\n\n_Ex.: *80 mil*_`;
        } else if (isMuchMore) {
            forcedText = `Sem problemas! Não precisa ser exato, apenas uma média aproximada mensal para avaliarmos as melhores condições para sua empresa. Quanto você estima?\n\n_Ex.: *80 mil*_`;
        } else if (alreadyAskedFaturamento) {
            forcedText = `Para avançarmos com a simulação sem compromisso, preciso apenas de um valor médio aproximado do faturamento mensal da sua empresa em reais.\n\n_Ex.: *80 mil*_`;
        } else if (requested_amount && requested_amount > 0) {
            const reqFmt = Number(requested_amount).toLocaleString('pt-BR');
            forcedText = `Perfeito! Registrei o valor de *R$ ${reqFmt}* para a sua análise.\n\nAgora, por favor, me informe o *faturamento médio mensal* da sua empresa para prosseguirmos com a simulação.\n\n_Ex.: *80 mil*_`;
        } else {
            // 🎯 P2 Oficial Ticket: Texto enxuto na coleta de faturamento (sem Razão Social)
            forcedText = `Ok! Para avaliarmos a melhor condição disponível para sua empresa, poderia nos informar o faturamento médio mensal atual?\n\n_Ex.: 80 mil_`;
        }
        if (!isDoubt) mode = "parrot";
    } else if (nextStep === 'consentimento_optin') {
        const hasFaturamentoInCurrent = Boolean(unifiedExtraction.revenue || /\bfaturamento\b/i.test(lastUserLower) || (currentStep === 'coleta_faturamento' && revenue && revenue > 0));
        if (hasFaturamentoInCurrent && revenue && revenue > 0) {
            const revFmt = Number(revenue).toLocaleString('pt-BR');
            const reqFmt = requested_amount ? ` e o crédito solicitado de *R$ ${Number(requested_amount).toLocaleString('pt-BR')}*` : '';
            forcedText = `Perfeito! Registrei o faturamento de *R$ ${revFmt}*${reqFmt} da sua empresa.\n\nPara avançarmos com a análise do crédito, basta confirmar a autorização clicando no botão *[✅ SIM, AUTORIZO]* abaixo:`;
            mode = "parrot";
        } else {
            forcedText = `Li e entendi o termo de autorização e autorizo o tratamento de meus dados, inclusive para consulta ao SCR/Bacen e Entidades registradoras.`;
            if (!isDoubt) mode = "parrot";
        }
    } else if (nextStep === 'optin_recusado') {
        forcedText = `Sem problema! Gostaríamos de reforçar que só podemos seguir com a análise de crédito se você aceitar a pesquisa pela Fiserv. Se mudar de ideia, é só me chamar aqui que retomamos. 👍`;
        mode = "parrot";
    } else if (nextStep === 'desistencia_cliente') {
        forcedText = `Sem problemas! Compreendo perfeitamente. Caso precise de reforço de caixa no futuro ou queira conhecer as condições para sua empresa, estarei por aqui à disposição. Tenha um ótimo dia! 👍`;
        mode = "parrot";
    } else if (nextStep === 'aguardando_fiserv') {
        forcedText = `Sua solicitação já está em análise pelo comitê da Fiserv! ⏳\n\nEstamos acompanhando de perto e, assim que tivermos um retorno sobre os valores liberados para o seu CNPJ *${leadInfo.cnpj || ""}*, chamaremos você por aqui mesmo com o resultado.\n\nEnquanto esperamos, posso te ajudar com mais alguma dúvida?`;
    } else if (nextStep === 'recusa_analise') {
        const nomeCliente = leadInfo.name ? `Olá, *${leadInfo.name}*!` : 'Olá!';
        const motivoFiserv = leadInfo.fiserv_external_status || "Analisamos sua solicitação e desta vez não conseguimos aprová-la devido a políticas internas de crédito.";
        const recusaAlreadySent = historyTexts.includes("não conseguimos liberar") || historyTexts.includes("políticas internas de crédito") || historyTexts.includes("politicas internas de credito");

        // 🛡️ REQUISITO: NÃO colocar na Fila de Atendimento todo lead recusado!
        // Apenas transferir para humano se o cliente pedir explicitamente OU usar tom agressivo/ofensas.
        if (isHumanRequest || isOffensiveOrAggressive) {
            forcedText = isOffensiveOrAggressive
                ? `Compreendo sua insatisfação e peço desculpas pelo ocorrido. Vou direcionar sua mensagem imediatamente para a nossa equipe de supervisão verificar seu caso com prioridade.`
                : `Entendido! Vou transferir o seu atendimento para um de nossos especialistas humanos. Em breve entraremos em contato com você por aqui. 👍`;
            mode = "parrot";
        } else if (recusaAlreadySent) {
            // Lead recusado comum/neutro (respondeu "ok", "obrigado", emojis ou clicou em botão antigo):
            // 🛡️ NÃO envia para Fila de Atendimento, NÃO trava em human_active, e silencia o robô!
            return {
                currentStep: "stop_flow",
                stop_flow: true,
                trigger_handoff: false,
                reason: "Lead recusado neutro. Robô silenciado sem transbordo humano (preserva revalidação de 30 dias).",
                conversation_id: rpcData.conversation?.id || rpcData.p_conversation_id,
                p_conversation_id: rpcData.conversation?.id || rpcData.p_conversation_id
            };
        } else {
            // Notificação inicial de recusa da Fiserv: resposta amigável direta sem transbordo humano
            forcedText = `${nomeCliente}\n\n${motivoFiserv}\n\nAs análises de crédito são dinâmicas e baseadas em critérios de mercado e volume de transações Ticket. Você poderá solicitar uma nova análise em *30 dias*!\n\nObrigado pela confiança na Ticket! 🙏`;
            mode = "parrot";
        }
    } else if (nextStep === 'criar_lead') {
        forcedText = `Perfeito! Sua solicitação já está em analise.\n\n⏳ Avaliando em ~1 minuto...\nAssim que tivermos o retorno, chamaremos aqui com o resultado!`;
        mode = "parrot";
    } else if (nextStep === 'apresenta_ofertas' && approvedLimit > 0 && requested_amount && requested_amount > approvedLimit) {
        const maxTerm = leadInfo.max_installments || leadInfo.approved_installments || leadInfo.installments || 24;
        forcedText = `O valor de *R$ ${formatPtBrMoney(requested_amount)}* que você solicitou excede o seu limite pré-aprovado de *R$ ${formatPtBrMoney(approvedLimit)}*.\n\nPor favor, informe o valor que deseja solicitar (até *R$ ${formatPtBrMoney(approvedLimit)}*) e em quantas parcelas (de 6 a ${maxTerm} parcelas).`;
        if (!isDoubt) mode = "parrot";
    } else if (nextStep === 'apresenta_ofertas' && requested_amount && !requested_installments) {
        const maxTerm = leadInfo.max_installments || leadInfo.approved_installments || leadInfo.installments || 24;
        forcedText = `Ótimo! Entendi que você deseja simular o valor de *R$ ${formatPtBrMoney(requested_amount)}*.\n\nEm quantas parcelas você gostaria de simular? (Lembrando que o prazo é de 6 a ${maxTerm} parcelas).`;
        if (!isDoubt) mode = "parrot";
    } else if (nextStep === 'apresenta_ofertas' && !requested_amount && requested_installments) {
        const limiteTxt = approvedLimit > 0 ? ` (até *R$ ${formatPtBrMoney(approvedLimit)}*)` : '';
        forcedText = `Certo, você gostaria de simular em *${requested_installments} parcelas*.\n\nPara prosseguirmos, qual o valor exato que você deseja solicitar nessa simulação${limiteTxt}?`;
        if (!isDoubt) mode = "parrot";
    } else if (nextStep === 'apresenta_ofertas' && !requested_amount && !requested_installments) {
        const maxTerm = leadInfo.max_installments || leadInfo.approved_installments || leadInfo.installments || 24;
        const limiteTxt = approvedLimit > 0 ? ` (seu limite pré-aprovado é de até *R$ ${formatPtBrMoney(approvedLimit)}*)` : '';
        forcedText = `Perfeito! Vamos fazer uma nova simulação.\n\nPor favor, informe qual valor deseja simular${limiteTxt} e em quantas parcelas (de 6 a ${maxTerm} parcelas).`;
    } else if (nextStep === 'confirmacao_cliente' && isSofiaAtDisposalAck) {
        forcedText = `Combinado! Tenha um ótimo dia e fico por aqui à disposição se precisar de algo. 👍`;
        mode = "parrot";
    } else if (nextStep === 'reforco_condicoes') {
        forcedText = `Agora que já falamos sobre a cotação, vamos falar de alguns detalhes importantes pra você dominar o produto e ficar tudo bem claro.\n\n*1- O que é esse empréstimo?*\nÉ uma linha de Capital de Giro Digital.\n*2- Qual é a garantia?*\nO gravame dos seus recebíveis futuros de Ticket, cartão de crédito e débito.\n*3- Como eu faço pagamento das parcelas, vocês fazem retenções?*\nNão fazemos retenções, você receberá boletos para pagamentos mensais.\n*4- Meu recebível ficará preso?*\nNÃO, a menos que você não pague as parcelas do empréstimo no vencimento.\n*5- Mas o que acontece se eu atrasar?*\nO sistema bloqueia seu recebível até liquidar a parcela, depois volta a liberar.\n*6- Eu consigo fazer antecipação do meu recebível se eu contratar o Capital de Giro da Ticket?*\nSIM, normalmente.\n\n*Clique no botão abaixo para prosseguir:*`;
        if (!isDoubt) mode = "parrot";
    } else if (nextStep === 'finalizacao_sucesso') {
        forcedText = `Maravilha!\nEstamos quase lá.\n\nAgora um dos nossos especialistas entrará em contato para pegar as últimas informações e liberar o crédito no sistema.\n\nMas se tiver alguma dúvida, estou por aqui!`;
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
        else if (pastMsg.includes("valor desejado") || pastMsg.includes("solicitar na análise") || pastMsg.includes("valor aproximado") || pastMsg.includes("solicitar nessa análise") || pastMsg.includes("valor mínimo para solicitação") || pastMsg.includes("valor máximo disponível") || pastMsg.includes("deseja solicitar")) pastStep = 'coleta_valor';
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
        forcedText = `Certo! Para agilizar seu atendimento e te apoiar diretamente com essa etapa, vou transferir sua conversa para um de nossos especialistas. Um instante, por favor!`;
        mode = "parrot";
    }

    // 🛡️ BLINDAGEM ANTI-ECO & ANTI-REPETIÇÃO DA CAMPANHA (PRODUÇÃO)
    // NUNCA disparar anti-eco em etapas legítimas de reforço de condições, finalização ou ofertas
    const isLegitimateProductStep = ['reforco_condicoes', 'finalizacao_sucesso', 'apresenta_ofertas', 'solicitar_simulacao'].includes(nextStep);
    const isCampaignEcho = !isLegitimateProductStep && (currentStep === 'start' || nextStep === 'start') && (
        forcedText.includes("Já pensou em reforçar o caixa") ||
        (forcedText.includes("sem burocracia") && forcedText.includes("taxas a partir de 1,89%"))
    );

    // Se o robô já enviou mensagens antes e está tentando reenviar o pitch de abertura:
    if (assistantMessages.length > 0 && isCampaignEcho && !isStrictGreeting) {
        nextStep = 'coleta_valor';
        forcedText = `Perfeito! Para avaliarmos a melhor condição disponível para sua empresa, me informe por favor o *valor que deseja solicitar* e o seu *faturamento médio mensal*.\n\n_Exemplo: 50 mil e 80 mil_`;
        mode = "parrot";
    }

    // Se a mensagem que o robô vai enviar for idêntica à última que ele já enviou:
    if (assistantMessages.length > 0) {
        const lastSentNormalized = normalizeText(assistantMessages[assistantMessages.length - 1]?.content || assistantMessages[assistantMessages.length - 1]?.text);
        if (cleanNextText.length > 20 && lastSentNormalized === cleanNextText) {
            if (nextStep === 'coleta_valor' || currentStep === 'start' || currentStep === 'explicacao_agente') {
                forcedText = `Perfeito! Para avaliarmos a melhor condição disponível para sua empresa, me informe por favor o *valor que deseja solicitar* e o seu *faturamento médio mensal*.\n\n_Exemplo: 50 mil e 80 mil_`;
                nextStep = 'coleta_valor';
            } else if (nextStep === 'coleta_faturamento') {
                forcedText = `Sem problemas! Apenas uma média aproximada do faturamento mensal já é suficiente para avançarmos. Quanto você estima?\n\n_Ex.: 80 mil_`;
            } else if (isCourtesyAck || isFarewell) {
                forcedText = `Combinado! Tenha um ótimo dia e fico por aqui à disposição se precisar de algo. 👍`;
                mode = "parrot";
            } else {
                forcedText = `Certo! Entendido. Fico por aqui à disposição caso precise de algo mais ou queira simular novas condições. 👍`;
                mode = "parrot";
            }
        }
    }

    // 🛡️ TRAVA MESTRA DE MODO CONSULTIVO: Se o cliente tem dúvida ou pergunta qualitativa, NUNCA opera em Parrot Mode!
    if ((isDoubt || (isFarewell && !isSofiaAtDisposalAck)) && !isAgentButtonClick && !isHumanRequest && !isLinkIssue && !loopDetectedHandoff && leadInfo.is_lead !== false && !isDeniedFiserv && !isCnpjDivergent && nextStep !== 'finalizacao_sucesso') {
        mode = "consultive";
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

Posso pagar no cartão de crédito/débito? / Como faço para pagar as parcelas?
Não é possível pagar as parcelas via cartão de crédito ou débito. O pagamento é realizado mensalmente via Boleto Bancário. Suas vendas na maquininha continuam caindo 100% normalmente na sua conta, sem retenção diária ou desconto automático. Seus recebíveis futuros servem apenas como garantia da operação caso ocorra inadimplência prolongada (3 a 4 meses).

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
3. GANCHO DE RETORNO AO FUNIL: Sempre que responder a uma dúvida técnica, responda com precisão, acolhimento e clareza. Em seguida, adicione o gancho convidando o cliente a continuar a etapa atual (${nextStep}). Se a etapa atual for 'apresenta_ofertas', após esclarecer a dúvida, convide o cliente a informar em quantas parcelas (de 6 a 24 parcelas) deseja simular para o valor de crédito desejado (ou se prefere simular outro valor).
4. HESITAÇÃO OU ANÁLISE NA CONFIRMAÇÃO (ETAPA confirmacao_cliente): Se o cliente já recebeu a simulação e disser que vai analisar, pensar, avaliar ou consultar sócio/esposa (ex: "vou analisar", "vou pensar", "deixa eu ver", "vou ver com meu sócio"): NUNCA repita a simulação estática. Seja acolhedora, respeite o tempo de decisão dele, pergunte gentilmente se ficou alguma dúvida sobre as condições, valores ou parcelas que você possa esclarecer para ajudá-lo a avaliar, e lembre-o de que se preferir simular em outro prazo ou valor, você está à disposição.
5. REGRA ANTI-REPETIÇÃO ABSOLUTA: É terminantemente proibido enviar a mesma resposta ou mensagem equivalente à que você já enviou imediatamente antes no histórico. Se você já se colocou à disposição ou explicou algo, e o cliente apenas confirmou com palavras de cortesia ou fechamento (ex: "certo", "ok", "combinado", "beleza", "obrigado", "show", "valeu"), NUNCA repita o texto anterior nem ofereça novamente as mesmas opções. Responda apenas confirmando com simpatia (ex: "Combinado! Tenha um ótimo dia e fico por aqui à disposição se precisar de algo. 👍") e finalize sem perguntas repetitivas.
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
                nome_arquivo: "Termo de autorizacao.pdf"
            }
        };
    } else if (nextStep === 'confirmacao_cliente') {
        interactive_buttons = isSofiaAtDisposalAck ? null : {
            tipo: "botoes",
            opcoes: ["Falar especialista", "Nova simulação"],
            pre_message: null
        };
    } else if (nextStep === 'reforco_condicoes') {
        interactive_buttons = {
            tipo: "botoes",
            opcoes: ["👍 OK, entendi!"],
            pre_message: null
        };
    }

    const isHandoff = (isHumanRequest || isTalkToSpecialist || nextStep === 'finalizacao_sucesso' || effectiveComplaint || loopDetectedHandoff || nextStep === 'coleta_cnpj_correto' || currentStep === 'coleta_cnpj_correto') && !isAgentButtonClick;

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
            priority: (isOffensiveOrAggressive || effectiveComplaint || loopDetectedHandoff || nextStep === 'coleta_cnpj_correto' || isCnpjDivergent) ? 'high' : 'medium'
        },
        tenant_id: ctx.tenant_id || rpcData.tenant_id || leadInfo.tenant_id,
        identity_confirmed: isIdentityConfirmed,
        cnpj_confirmed: isIdentityConfirmed,
        lead_info: {
            ...leadInfo,
            loan_request_id: leadInfo.fiserv_loan_request_id || leadInfo.loan_request_id,
            fiserv_loan_request_id: leadInfo.fiserv_loan_request_id || leadInfo.loan_request_id,
            cnpj: leadInfo.cnpj,
            phone: rpcData.payload?.phone || leadInfo.phone || ctx.payload?.phone,
            name: leadInfo.name,
            identity_confirmed: isIdentityConfirmed,
            cnpj_confirmed: isIdentityConfirmed,
            journey_type: isPreApprovedJourney ? 'pre_approved' : (leadInfo.journey_type || 'standard'),
            revenue: revenue || leadInfo.revenue,
            requested_amount: (isRestartSimulation && !userTypedNewNumbers) ? null : (requested_amount || leadInfo.requested_amount),
            requested_installments: (isRestartSimulation && !userTypedNewNumbers) ? null : (requested_installments || leadInfo.requested_installments),
            simulation_data: leadInfo.simulation_data || ctx.simulation_data || {
                amount: requested_amount || leadInfo.requested_amount,
                installments: requested_installments || leadInfo.requested_installments || 24,
                installment_value: leadInfo.installment_value || ctx.chosen_installment_value || null
            }
        },
        revenue: revenue,
        requested_amount: requested_amount,
        debug: { nextStep, mode, isLinkIssue, isSelfSimulationRequest, currentCampaignId, loopDetected: isLoopDetected, semanticIntent, isComplaint, isFirstComplaint, effectiveComplaint, parsedRevenue: revenue, parsedAmount: requested_amount, hasPriorOptIn, isOptInWithin30Days, isIdentityConfirmed, isPreApprovedJourney, isCnpjDivergent },
        close_conversation: (nextStep === 'desistencia_cliente' || nextStep === 'optin_recusado'),
        is_refused: (nextStep === 'desistencia_cliente' || nextStep === 'optin_recusado'),
        conversation_status: (nextStep === 'desistencia_cliente' || nextStep === 'optin_recusado') ? 'closed' : 'ai_active',
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
    // 🛡️ FALLBACK SEGURO PRODUÇÃO: Interrompe fluxo para evitar loop infinito
    return {
        currentStep: "stop_flow",
        stop_flow: true,
        is_auto_reply: true,
        circuit_breaker: true,
        reason: "Falha de processamento no Roteador: " + (globalError?.message || "Erro desconhecido"),
        p_conversation_id: (typeof $node !== 'undefined' && $node["RPC - Acesso Entrada"]?.json?.conversation?.id) || (typeof $node !== 'undefined' && $node["RPC - Acesso Entrada"]?.json?.p_conversation_id) || null,
        conversation_id: (typeof $node !== 'undefined' && $node["RPC - Acesso Entrada"]?.json?.conversation?.id) || (typeof $node !== 'undefined' && $node["RPC - Acesso Entrada"]?.json?.p_conversation_id) || null,
        trigger_handoff: false,
        handoff_data: {},
        debug: { globalError: globalError?.message, stack: globalError?.stack }
    };
}
