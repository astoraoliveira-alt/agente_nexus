# Davos Nexus — Node Engine Architecture v2.0
## Backend Distribuído: Pipeline Pattern, Observabilidade por Step e CI/CD Readiness

> **Data:** 03/Abr/2026  
> **Versão:** 2.0 — Redesign Completo (Pipeline > Orchestrator)  
> **Contexto:** Backend nativo que coexiste com N8N via Execution Router  
> **Status:** Blueprint aprovado para implementação incremental

> ### ⚠️ Por Que Esta é a v2.0
> A v1.0 cometeu o mesmo erro que estava tentando corrigir:
> criou um `MessageOrchestrator` com 11 steps lineares que,
> na prática, cresce para um **monólito com IFs e exceções acumuladas**.
> A v2.0 adota o **Pipeline Pattern** — cada step é isolado,
> plugável, testável e observável individualmente.

---

## 1. O Problema Que Não Podemos Repetir

```
N8N hoje (o problema):
  Todos os fluxos acoplados num canvas
  → uma mudança quebra outra coisa
  → debug difícil em produção
  → impossível testar isolado

Orchestrator v1.0 (o mesmo problema em código):
  MessageOrchestrator com 11 steps lineares
  → if intentA → fluxoA
  → if clienteX → exceção especial
  → em 3 meses: monólito impossível de evoluir
  → debug pior que no N8N (sem interface visual)

Pipeline v2.0 (a solução):
  pipeline.execute([
    GuardrailsStep,    // testável isolado
    MediaStep,         // testável isolado
    IntentStep,        // testável isolado
    SecurityStep,      // testável isolado
    RAGStep,           // testável isolado
    LLMStep,           // testável isolado
    ResponseStep,      // testável isolado
  ])
  → adicionar step = criar 1 arquivo
  → remover step = deletar 1 arquivo
  → reordenar = mudar a array
  → testar = mockar steps anteriores
```

---

## 2. Contrato Central: PipelineStep

Todo o sistema gira em torno desta interface. **Qualquer dev que entenda essa interface entende 100% do sistema.**

```typescript
// porteiro/src/engine/pipeline/PipelineStep.ts

/**
 * Interface base para todos os steps do pipeline de processamento de mensagens.
 *
 * PRINCÍPIOS:
 * - Um step faz UMA coisa e faz bem.
 * - Um step NUNCA chama outro step diretamente.
 * - Um step recebe o PipelineContext e pode enriquecê-lo.
 * - Um step pode sinalizar que o pipeline deve parar (halt).
 *
 * PARA CRIAR UM NOVO STEP:
 * 1. Crie um arquivo em src/engine/steps/
 * 2. Implemente esta interface
 * 3. Adicione ao array em NodeEngine.buildPipeline()
 * 4. Escreva os testes em src/engine/steps/__tests__/
 */
export interface PipelineStep {
  /** Nome único do step — usado em logs, métricas e traces */
  readonly name: string;

  /**
   * Executa a lógica do step.
   * @param ctx - Contexto mutável compartilhado entre steps
   * @returns StepResult indicando sucesso, halt ou erro
   */
  execute(ctx: PipelineContext): Promise<StepResult>;

  /**
   * Retorna true se o step deve ser pulado para este contexto.
   * Evita condicionais dentro do execute().
   * Exemplo: MediaStep.shouldSkip() retorna true se messageType === 'text'
   */
  shouldSkip?(ctx: PipelineContext): boolean;
}

export type StepResult =
  | { status: 'continue' }           // próximo step
  | { status: 'halt'; reason: string } // pipeline para (sem erro — ex: spam)
  | { status: 'error'; error: Error };  // falha — vai para DLQ
```

---

## 3. PipelineContext — O Estado Tipado e Controlado

> **Regra crítica:** `context_state` (JSONB no banco) nunca cresce livremente.
> Tem um contrato TypeScript que é a fonte da verdade.

```typescript
// porteiro/src/engine/pipeline/PipelineContext.ts

/**
 * Estado compartilhado entre todos os steps do pipeline.
 * Mutável — cada step pode enriquecer o contexto para o próximo.
 *
 * CAMPOS IMUTÁVEIS (setados na entrada, nunca alterados):
 *   - queueId, traceId, tenantId, agentId, phone, messageType
 *
 * CAMPOS ENRIQUECIDOS (cada step preenche o seu):
 *   - textContent       → MediaStep (transcrição ou OCR)
 *   - intent            → IntentStep
 *   - isAuthenticated   → SecurityStep
 *   - ragChunks         → RAGStep
 *   - llmResponse       → LLMStep
 */
export interface PipelineContext {
  // ── Identidade (imutável) ───────────────────────────────────────────
  readonly queueId: string;
  readonly traceId: string;
  readonly tenantId: string;
  readonly agentId: string;
  readonly conversationId: string;
  readonly phone: string;
  readonly messageType: 'text' | 'audio' | 'image' | 'video' | 'document';
  readonly rawContent: string;       // mensagem original, nunca alterada
  readonly mediaUrl?: string;
  readonly mediaBase64?: string;

  // ── Configuração do Agente (imutável após load) ─────────────────────
  readonly agent: AgentConfig;

  // ── Enriquecido pelos steps (mutável) ───────────────────────────────
  textContent: string;               // após MediaStep (transcrição/OCR)
  conversation?: ConversationRecord;  // após ConversationStep
  contextState: ContextState;        // estado persistente tipado
  intent?: IntentResult;             // após IntentStep
  isAuthenticated: boolean;          // após SecurityStep
  ragChunks: string[];               // após RAGStep
  llmResponse?: string;              // após LLMStep
  tokensUsed: number;
  audioDurationSeconds?: number;

  // ── Observabilidade ─────────────────────────────────────────────────
  stepTraces: StepTrace[];          // trace de cada step executado
}

/**
 * Contrato explícito do context_state persistido no banco (JSONB).
 * NUNCA adicione campos sem atualizar este tipo.
 * NUNCA use 'any' ou campos livres.
 */
export interface ContextState {
  isAuthenticated: boolean;
  validatedIdentifier?: string;  // CNPJ/CPF validado pelo Gatekeeper
  lastIntent?: string;
  lastMessageAt?: string;        // ISO 8601
  flags: {
    linkSentAttempt?: boolean;   // link de conversão enviado
    humanHandoffRequested?: boolean;
    gatekeeperChallenged?: boolean;
  };
  // Para adicionar um novo flag: adicione aqui + migre quem lê/escreve
}

// Validador em runtime (garante que dados do banco não corrompem o contrato)
export function validateContextState(raw: unknown): ContextState {
  const defaults: ContextState = {
    isAuthenticated: false,
    flags: {},
    lastMessageAt: new Date().toISOString(),
  };

  if (!raw || typeof raw !== 'object') return defaults;

  const r = raw as Record<string, unknown>;
  return {
    isAuthenticated: Boolean(r.isAuthenticated ?? false),
    validatedIdentifier: typeof r.validatedIdentifier === 'string'
      ? r.validatedIdentifier : undefined,
    lastIntent: typeof r.lastIntent === 'string' ? r.lastIntent : undefined,
    lastMessageAt: typeof r.lastMessageAt === 'string'
      ? r.lastMessageAt : defaults.lastMessageAt,
    flags: {
      linkSentAttempt: Boolean((r.flags as any)?.linkSentAttempt ?? false),
      humanHandoffRequested: Boolean((r.flags as any)?.humanHandoffRequested ?? false),
      gatekeeperChallenged: Boolean((r.flags as any)?.gatekeeperChallenged ?? false),
    },
  };
}
```

---

## 4. StepTracer — Observabilidade por Step

> **Princípio:** se você não pode ver o que aconteceu em cada step
> durante um incidente de produção, o debug vai ser **pior que no N8N**.

```typescript
// porteiro/src/engine/observability/StepTracer.ts

/**
 * Registra a execução de cada step individualmente.
 *
 * Cada step gera um StepTrace com:
 * - traceId global (rastreio end-to-end)
 * - stepName (qual step falhou/passou)
 * - durationMs (performance)
 * - inputSummary (o que entrou — sem PII sensível)
 * - outputSummary (o que saiu)
 * - error (se houver)
 *
 * Por que não só o Langfuse?
 * Langfuse cobre chamadas LLM. StepTracer cobre todo o pipeline
 * (guardrails, mídia, segurança, banco) — onde os bugs reais vivem.
 */
export interface StepTrace {
  stepName: string;
  status: 'ok' | 'skipped' | 'halted' | 'error';
  durationMs: number;
  inputSummary?: Record<string, unknown>;  // resumo seguro (sem tokens/chaves)
  outputSummary?: Record<string, unknown>;
  error?: string;
  timestamp: string;
}

export class StepTracer {
  private readonly traces: StepTrace[] = [];

  /**
   * Executa um step com rastreio automático.
   * Uso: await tracer.trace(ctx, step)
   */
  async trace(ctx: PipelineContext, step: PipelineStep): Promise<StepResult> {
    const start = Date.now();

    // Skip check
    if (step.shouldSkip?.(ctx)) {
      this.record(step.name, 'skipped', Date.now() - start);
      return { status: 'continue' };
    }

    try {
      const result = await step.execute(ctx);
      const durationMs = Date.now() - start;

      this.record(step.name, result.status === 'halt' ? 'halted' : 'ok', durationMs, {
        output: result.status === 'halt' ? { reason: result.reason } : undefined,
      });

      // Prometheus metric (compatível com Grafana)
      metrics.histogram('pipeline_step_duration_ms', durationMs, {
        step: step.name,
        status: result.status,
        tenant: ctx.tenantId,
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - start;
      const err = error instanceof Error ? error : new Error(String(error));

      this.record(step.name, 'error', durationMs, { error: err.message });

      // Log estruturado — essencial para debug em produção
      logger.error({
        event: 'step_failed',
        traceId: ctx.traceId,
        step: step.name,
        tenantId: ctx.tenantId,
        agentId: ctx.agentId,
        durationMs,
        error: err.message,
        stack: err.stack,
      });

      return { status: 'error', error: err };
    }
  }

  getTraces(): StepTrace[] { return [...this.traces]; }

  private record(
    stepName: string,
    status: StepTrace['status'],
    durationMs: number,
    extra: Partial<StepTrace> = {}
  ): void {
    this.traces.push({
      stepName,
      status,
      durationMs,
      timestamp: new Date().toISOString(),
      ...extra,
    });
  }
}
```

---

## 5. O Pipeline — O "Canvas" em Código Legível

```typescript
// porteiro/src/engine/pipeline/Pipeline.ts

/**
 * Motor de execução sequencial de steps.
 *
 * DESIGN:
 * - Steps são executados na ordem do array
 * - Cada step pode parar o pipeline (halt) ou sinalizá erro
 * - O pipeline NÃO conhece a lógica de nenhum step
 * - Adicionar funcionalidade = criar 1 arquivo + adicionar ao array
 *
 * PARA ENTENDER O FLUXO COMPLETO:
 * Leia NodeEngine.buildPipeline() — é a única lista de steps.
 */
export class Pipeline {
  private readonly tracer: StepTracer;

  constructor() {
    this.tracer = new StepTracer();
  }

  async execute(steps: PipelineStep[], ctx: PipelineContext): Promise<PipelineResult> {
    const start = Date.now();

    for (const step of steps) {
      const result = await this.tracer.trace(ctx, step);

      if (result.status === 'halt') {
        return this.finish(ctx, 'halted', start, result.reason);
      }

      if (result.status === 'error') {
        return this.finish(ctx, 'error', start, undefined, result.error);
      }
    }

    // Persiste os traces no banco para debug posterior
    // (não bloqueia — fire and forget com tratamento de erro próprio)
    this.persistTraces(ctx).catch(err =>
      logger.warn('Falha ao persistir traces', { traceId: ctx.traceId, err })
    );

    return this.finish(ctx, 'success', start);
  }

  private finish(
    ctx: PipelineContext,
    status: 'success' | 'halted' | 'error',
    startMs: number,
    haltReason?: string,
    error?: Error
  ): PipelineResult {
    return {
      status,
      traceId: ctx.traceId,
      durationMs: Date.now() - startMs,
      tokensUsed: ctx.tokensUsed,
      stepTraces: this.tracer.getTraces(),
      haltReason,
      error,
    };
  }

  private async persistTraces(ctx: PipelineContext): Promise<void> {
    await supabase.from('pipeline_execution_traces').insert({
      trace_id: ctx.traceId,
      tenant_id: ctx.tenantId,
      agent_id: ctx.agentId,
      conversation_id: ctx.conversationId,
      steps: ctx.stepTraces,
      created_at: new Date().toISOString(),
    });
  }
}
```

---

## 6. Steps — Cada Step em Detalhe

### 6.1 Estrutura de Diretórios

```
porteiro/src/engine/
│
├── pipeline/
│   ├── Pipeline.ts               # Motor de execução
│   ├── PipelineContext.ts        # Estado tipado + ContextState
│   └── PipelineStep.ts           # Interface base
│
├── steps/                        # ← UMA CLASSE POR FUNCIONALIDADE
│   ├── GuardrailsStep.ts         # Anti-ban, quota, validações de entrada
│   ├── MediaStep.ts              # Audio STT + Image OCR
│   ├── ConversationStep.ts       # Abre/reabre conversa, restaura estado
│   ├── IntentStep.ts             # Classificação de intenção (LLM leve)
│   ├── SecurityStep.ts           # Identity Gate (SEMPRE determinístico)
│   ├── RAGStep.ts                # Recuperação de conhecimento vetorial
│   ├── LLMStep.ts                # Chamada ao LLM principal
│   ├── ToolExecutorStep.ts       # Execução de tools (separado do LLM)
│   ├── ResponseStep.ts           # Envio da resposta ao usuário
│   └── PersistenceStep.ts        # Grava mensagens, estado, telemetria
│
├── services/                     # Serviços usados pelos steps (sem lógica de fluxo)
│   ├── AudioTranscriberService.ts
│   ├── ImageOCRService.ts
│   ├── StorageService.ts
│   ├── PolicyEngine.ts           # DETERMINÍSTICO — não usa LLM
│   ├── IntentClassifierService.ts # PROBABILÍSTICO — usa LLM leve
│   ├── LLMService.ts             # Chamada pura ao LLM
│   ├── ToolExecutorService.ts    # Execução segura de tools
│   ├── RAGService.ts
│   ├── MessagingService.ts
│   ├── EvolutionProvider.ts
│   ├── ZenviaProvider.ts
│   ├── TelemetryService.ts
│   └── GatekeeperService.ts
│
├── observability/
│   ├── StepTracer.ts             # Rastreio por step
│   ├── MetricsCollector.ts       # Prometheus metrics
│   └── StructuredLogger.ts       # Logger com contexto
│
├── engines/
│   ├── N8NEngine.ts              # Wrapper do N8N (comportamento atual)
│   └── NodeEngine.ts             # buildPipeline() — lista de steps
│
├── workers/
│   ├── InboundQueueWorker.ts
│   ├── CampaignWorker.ts
│   ├── AuditWorker.ts
│   └── IdleConversationWorker.ts
│
└── router/
    └── ExecutionRouter.ts        # O switch: n8n | node
```

### 6.2 GuardrailsStep

```typescript
// porteiro/src/engine/steps/GuardrailsStep.ts

/**
 * STEP: Guardrails de Entrada
 *
 * RESPONSABILIDADE: bloquear mensagens que não devem ser processadas.
 * Executa ANTES de qualquer chamada LLM ou banco pesado.
 *
 * VERIFICA:
 * - Contato banido (anti-spam)
 * - Quota do tenant atingida
 * - Agente ativo
 * - Empresa ativa
 *
 * RESULTADO:
 * - 'halt': mensagem bloqueada silenciosamente (sem resposta ao usuário)
 * - 'continue': tudo ok, próximo step
 *
 * LATÊNCIA ALVO: < 20ms (apenas queries por índice)
 */
export class GuardrailsStep implements PipelineStep {
  readonly name = 'guardrails';

  constructor(
    private readonly antiBan: AntiBanService,
    private readonly quotaGuard: QuotaGuardService,
  ) {}

  async execute(ctx: PipelineContext): Promise<StepResult> {
    // 1. Contato banido?
    const isBanned = await this.antiBan.check(ctx.phone, ctx.tenantId);
    if (isBanned) {
      return { status: 'halt', reason: 'contact_banned' };
    }

    // 2. Quota atingida?
    const quotaOk = await this.quotaGuard.check(ctx.tenantId, ctx.agentId);
    if (!quotaOk) {
      return { status: 'halt', reason: 'quota_exceeded' };
    }

    // 3. Agente e empresa ativos? (já vem no ctx.agent — carregado pelo Router)
    if (ctx.agent.status !== 'active') {
      return { status: 'halt', reason: 'agent_inactive' };
    }

    return { status: 'continue' };
  }
}
```

### 6.3 IntentStep + PolicyEngine (a separação crítica)

```typescript
// porteiro/src/engine/steps/IntentStep.ts

/**
 * STEP: Classificação de Intenção
 *
 * RESPONSABILIDADE: identificar o que o usuário quer.
 *
 * DESIGN CRÍTICO — DUAS CAMADAS:
 *
 * 1. IntentClassifierService (PROBABILÍSTICO — usa LLM leve):
 *    - Classifica a intenção semântica ("quer saldo", "quer link", "reclamação")
 *    - Pode errar — é uma estimativa
 *    - Nunca toma decisões de segurança sozinho
 *
 * 2. PolicyEngine (DETERMINÍSTICO — sem LLM):
 *    - Avalia se a intenção requer autenticação
 *    - Decide se tools são permitidas
 *    - Baseado em regras explícitas configuradas no agente
 *    - NUNCA depende do LLM para decisões de segurança
 *
 * POR QUÊ SEPARAR?
 * LLM pode classificar "consultar saldo" como "pergunta geral"
 * e o sistema liberaria tools financeiras sem autenticação.
 * O PolicyEngine garante que isso nunca aconteça.
 */
export class IntentStep implements PipelineStep {
  readonly name = 'intent_classification';

  constructor(
    private readonly classifier: IntentClassifierService,
    private readonly policyEngine: PolicyEngine,
  ) {}

  async execute(ctx: PipelineContext): Promise<StepResult> {
    // 1. Classificação probabilística (LLM leve — gpt-4o-mini)
    const rawIntent = await this.classifier.classify({
      message: ctx.textContent,
      agentPolicies: ctx.agent.brain_config.policies ?? [],
    });

    // 2. Decisão determinística sobre segurança e ferramentas
    // O PolicyEngine usa REGRAS EXPLÍCITAS, não o resultado do LLM
    const policyDecision = this.policyEngine.evaluate({
      intentName: rawIntent.name,
      agentConfig: ctx.agent,
      contextState: ctx.contextState,
      phone: ctx.phone,
    });

    // Enriquece o contexto para o próximo step
    ctx.intent = {
      name: rawIntent.name,
      confidence: rawIntent.confidence,
      // ESTAS DECISÕES VÊM DO POLICY ENGINE, não do LLM
      requiresAuth: policyDecision.requiresAuth,
      allowTools: policyDecision.allowTools,
      shouldHandoffHuman: policyDecision.shouldHandoffHuman,
      isSpam: rawIntent.isSpam,
    };

    return { status: 'continue' };
  }
}
```

```typescript
// porteiro/src/engine/services/PolicyEngine.ts

/**
 * PolicyEngine — Motor de Regras Determinístico
 *
 * NUNCA usa LLM. Avalia regras explícitas baseadas em:
 * - Configuração do agente (brain_config, requires_security, applied_policies)
 * - Estado atual da conversa (isAuthenticated, flags)
 * - Intenção classificada (nome da categoria)
 *
 * REGRAS DE SEGURANÇA:
 * - Se agente.requires_security === true E intenção está na lista protegida
 *   E usuário NÃO está autenticado → requiresAuth = true
 * - Se intenção está na lista de cannotDo → allowTools = false
 * - Se mensagem aciona gatilho de handoff → shouldHandoffHuman = true
 *
 * TESTABILIDADE:
 * Sem side effects, sem I/O, sem async. Puramente funcional.
 * Resultado é 100% previsível para o mesmo input.
 */
export class PolicyEngine {
  // Intenções que SEMPRE requerem autenticação quando agente.requires_security=true
  private static readonly PROTECTED_INTENTS = new Set([
    'financial_query',
    'balance_check',
    'credit_request',
    'document_request',
    'account_data',
  ]);

  evaluate(params: {
    intentName: string;
    agentConfig: AgentConfig;
    contextState: ContextState;
    phone: string;
  }): PolicyDecision {
    const { intentName, agentConfig, contextState } = params;

    const requiresAuth =
      agentConfig.requires_security === true &&
      PolicyEngine.PROTECTED_INTENTS.has(intentName) &&
      !contextState.isAuthenticated;  // estado vem do banco — não do LLM

    const cannotDoList = agentConfig.brain_config?.policies
      ?.flatMap(p => p.cannotDo ?? []) ?? [];

    const allowTools = !requiresAuth && !cannotDoList.some(rule =>
      intentName.includes(rule.toLowerCase())
    );

    const handoffTriggers = agentConfig.brain_config?.policies
      ?.flatMap(p => p.transferConditions ?? []) ?? [];

    const shouldHandoffHuman = handoffTriggers.some(trigger =>
      intentName.includes(trigger.toLowerCase())
    );

    return { requiresAuth, allowTools, shouldHandoffHuman };
  }
}
```

### 6.4 ToolExecutorStep (Separado do LLM)

```typescript
// porteiro/src/engine/steps/ToolExecutorStep.ts

/**
 * STEP: Executor de Ferramentas
 *
 * RESPONSABILIDADE: executar tools solicitadas pelo LLM.
 *
 * SEPARADO DO LLMStep PORQUE:
 * - Loop de tool calls pode ser infinito (LLM fica chamando a mesma tool)
 * - Tool mal formada pode crashar o processo
 * - Partial execution (tool 1 ok, tool 2 falha) precisa tratamento próprio
 * - Métricas de tools precisam ser separadas das métricas de LLM
 *
 * PROTEÇÕES:
 * - MAX_TOOL_ITERATIONS: impede loop infinito
 * - Timeout por tool: evita travamento em API externa lenta
 * - Sanitização do output: remove tokens/secrets antes de retornar ao LLM
 *
 * shouldSkip: pula se o LLMStep não gerou tool calls
 */
export class ToolExecutorStep implements PipelineStep {
  readonly name = 'tool_execution';
  private static readonly MAX_ITERATIONS = 5;
  private static readonly TOOL_TIMEOUT_MS = 8000;

  constructor(private readonly executor: ToolExecutorService) {}

  shouldSkip(ctx: PipelineContext): boolean {
    // Só executa se o LLM pediu tools
    return !ctx.pendingToolCalls || ctx.pendingToolCalls.length === 0;
  }

  async execute(ctx: PipelineContext): Promise<StepResult> {
    let iterations = 0;
    let currentToolCalls = ctx.pendingToolCalls!;

    while (currentToolCalls.length > 0) {
      if (iterations >= ToolExecutorStep.MAX_ITERATIONS) {
        logger.warn({
          event: 'tool_loop_protection_triggered',
          traceId: ctx.traceId,
          iterations,
          lastTool: currentToolCalls[0]?.name,
        });
        break;
      }

      const results = await Promise.all(
        currentToolCalls.map(toolCall =>
          this.executor.executeWithTimeout(
            toolCall,
            ctx,
            ToolExecutorStep.TOOL_TIMEOUT_MS
          )
        )
      );

      // Retorna resultados ao contexto para o LLMStep usar na próxima iteração
      ctx.toolResults = results;
      ctx.tokensUsed += results.reduce((sum, r) => sum + (r.tokensUsed ?? 0), 0);

      // Verifica se o LLM precisa de mais tools após ver os resultados
      const nextLLMResult = await llmService.continueWithToolResults({
        model: ctx.agent.brain_config.modelId,
        previousMessages: ctx.llmMessages!,
        toolResults: results,
      });

      if (nextLLMResult.finish_reason !== 'tool_calls') {
        // LLM terminou — tem resposta final
        ctx.llmResponse = nextLLMResult.response;
        break;
      }

      currentToolCalls = nextLLMResult.tool_calls;
      iterations++;
    }

    return { status: 'continue' };
  }
}
```

---

## 7. NodeEngine — A Lista de Steps (O "Canvas" em Código)

```typescript
// porteiro/src/engine/engines/NodeEngine.ts

/**
 * NodeEngine — Implementação do IExecutionEngine baseada em Pipeline.
 *
 * PARA ENTENDER O FLUXO COMPLETO: leia buildPipeline().
 * É a única lista de steps. É o equivalente ao canvas visual do N8N.
 *
 * PARA ADICIONAR UM NOVO STEP:
 * 1. Crie o arquivo em src/engine/steps/
 * 2. Adicione ao array em buildPipeline()
 * 3. Escreva os testes
 * 4. Documente no CHANGELOG deste arquivo
 *
 * CHANGELOG DE STEPS:
 * 2026-04-03 | v1.0 | Steps base: Guardrails → Response
 */
export class NodeEngine implements IExecutionEngine {
  private readonly pipeline: Pipeline;
  private readonly steps: PipelineStep[];

  constructor() {
    // Injeção de dependências explícita — facilita testes e substituição
    const audioTranscriber = new AudioTranscriberService();
    const imageOCR = new ImageOCRService();
    const intentClassifier = new IntentClassifierService();
    const policyEngine = new PolicyEngine();
    const ragService = new RAGService();
    const llmService = new LLMService();
    const toolExecutor = new ToolExecutorService();
    const messaging = new MessagingService();
    const messageRecorder = new MessageRecorderService();
    const stateManager = new StateManagerService();
    const telemetry = new TelemetryService();
    const antiBan = new AntiBanService();
    const quotaGuard = new QuotaGuardService();
    const gatekeeper = new GatekeeperService();

    this.pipeline = new Pipeline();

    /**
     * FLUXO COMPLETO — EQUIVALENTE AO CANVAS DO N8N
     * Reordene, adicione ou remova steps aqui.
     * Cada step é independente e testável isolado.
     */
    this.steps = [
      new GuardrailsStep(antiBan, quotaGuard),      // anti-spam, quota, agente ativo
      new MediaStep(audioTranscriber, imageOCR),      // STT + OCR (pula se texto)
      new ConversationStep(stateManager),             // abre/reabre, restaura estado
      new IntentStep(intentClassifier, policyEngine), // classifica + política
      new SecurityStep(gatekeeper, messaging),        // Identity Gate (se necessário)
      new RAGStep(ragService),                        // recupera conhecimento (pula se sem RAG)
      new LLMStep(llmService),                        // chamada ao LLM
      new ToolExecutorStep(toolExecutor),             // executa tools (pula se sem tools)
      new ResponseStep(messaging),                    // envia resposta ao usuário
      new PersistenceStep(messageRecorder, telemetry, stateManager), // grava tudo
    ];
  }

  async execute(context: MessageContext): Promise<ExecutionResult> {
    const ctx = this.buildContext(context);
    const result = await this.pipeline.execute(this.steps, ctx);

    return {
      success: result.status === 'success',
      traceId: ctx.traceId,
      durationMs: result.durationMs,
      tokensUsed: ctx.tokensUsed,
      error: result.error?.message,
    };
  }

  async healthCheck(): Promise<boolean> {
    // Verifica dependências críticas
    try {
      await supabase.from('agents').select('id').limit(1);
      return true;
    } catch {
      return false;
    }
  }

  private buildContext(msg: MessageContext): PipelineContext {
    return {
      ...msg,
      textContent: msg.content,
      isAuthenticated: false,
      ragChunks: [],
      tokensUsed: 0,
      contextState: validateContextState(null), // estado zerado — ConversationStep vai carregar
      stepTraces: [],
    };
  }
}
```

---

## 8. Execution Router — Fallback Explícito com Métricas

```typescript
// porteiro/src/engine/router/ExecutionRouter.ts

/**
 * ExecutionRouter — Direciona mensagens para N8N ou Node Engine.
 *
 * ROTEAMENTO: baseado em agents.execution_mode ('n8n' | 'node')
 * FALLBACK: apenas com feature flag ativo + métrica crítica registrada
 *
 * ⚠️ FALLBACK NÃO É SILENCIOSO:
 * Se o Node Engine falhar e cair no N8N, isso É REGISTRADO como incidente.
 * Você VERÁ no dashboard de métricas: "X% de fallbacks no agente Y".
 * Fallback silencioso esconde bugs em produção.
 */
export class ExecutionRouter {
  private readonly n8n: N8NEngine;
  private readonly node: NodeEngine;

  constructor() {
    this.n8n = new N8NEngine();
    this.node = new NodeEngine();
  }

  async dispatch(context: MessageContext): Promise<ExecutionResult> {
    const engine = context.agent.execution_mode === 'node'
      ? this.node
      : this.n8n;

    try {
      return await engine.execute(context);
    } catch (error) {
      // Fallback para N8N APENAS se habilitado explicitamente
      const fallbackEnabled = process.env.NODE_ENGINE_FALLBACK_ENABLED === 'true';

      if (context.agent.execution_mode === 'node' && fallbackEnabled) {
        // MÉTRICA CRÍTICA — você vai ver isso no Grafana
        metrics.increment('node_engine_fallback_total', {
          agent: context.agentId,
          tenant: context.tenantId,
          error: (error as Error).message.slice(0, 50),
        });

        // LOG CRÍTICO — vai para alerting
        logger.error({
          event: 'node_engine_fallback',
          traceId: context.traceId,
          agentId: context.agentId,
          tenantId: context.tenantId,
          error: (error as Error).message,
          // Alerta se taxa de fallback > 5%
          alert: 'Verifique métricas: node_engine_fallback_total',
        });

        return this.n8n.execute(context);
      }

      throw error; // sem fallback → vai para DLQ normal
    }
  }
}
```

---

## 9. DevOps & CI/CD Readiness

### 9.1 Estrutura de Arquivos DevOps

```
porteiro/
├── src/                          # código fonte
├── Dockerfile                    # multi-stage build
├── .dockerignore
├── docker-compose.yml            # desenvolvimento local
├── docker-compose.prod.yml       # produção
├── .github/
│   └── workflows/
│       ├── ci.yml                # testes em PRs
│       └── deploy-porteiro.yml   # deploy em push main
├── scripts/
│   ├── validate-env.ts           # valida variáveis de ambiente
│   ├── health-check.sh           # health check externo
│   └── migrate.ts                # migrations de banco
└── jest.config.ts                # configuração de testes
```

### 9.2 Dockerfile Multi-Stage

```dockerfile
# porteiro/Dockerfile
# Multi-stage: build pequeno, imagem de produção mínima

# ── Stage 1: Build ────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copia apenas o que é necessário para instalar dependências
# (aproveita cache do Docker em builds sem mudança de deps)
COPY package*.json ./
RUN npm ci --only=production

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────
FROM node:22-alpine AS runtime

# Usuário não-root (segurança)
RUN addgroup -g 1001 porteiro && adduser -u 1001 -G porteiro -s /bin/sh -D porteiro

WORKDIR /app
USER porteiro

# Apenas o necessário para runtime
COPY --from=builder --chown=porteiro:porteiro /app/node_modules ./node_modules
COPY --from=builder --chown=porteiro:porteiro /app/dist ./dist
COPY --from=builder --chown=porteiro:porteiro /app/package.json ./

# Health check nativo do Docker
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

EXPOSE 3000

# Graceful shutdown: recebe SIGTERM e encerra limpo
CMD ["node", "--enable-source-maps", "dist/index.js"]
```

### 9.3 Validação de Ambiente no Startup

```typescript
// porteiro/src/scripts/validate-env.ts

/**
 * Valida TODAS as variáveis de ambiente antes de iniciar o servidor.
 * Se uma variável obrigatória estiver faltando, o processo ABORTA
 * com mensagem clara — nunca sobe em estado inválido.
 *
 * Por que isso é importante para CI/CD:
 * Evita deploys silenciosos que sobem mas falham na primeira mensagem.
 */
const REQUIRED_ENV_VARS = [
  // Supabase
  { key: 'SUPABASE_URL',           description: 'URL do projeto Supabase' },
  { key: 'SUPABASE_SERVICE_KEY',   description: 'Service Role Key (não a anon key)' },

  // OpenAI
  { key: 'OPENAI_API_KEY',         description: 'Chave OpenAI para LLM e Whisper' },

  // N8N (ainda necessário enquanto coexiste)
  { key: 'N8N_WEBHOOK_URL',        description: 'URL do webhook principal do N8N' },
  { key: 'N8N_API_KEY',            description: 'Bearer token do N8N' },

  // Porteiro
  { key: 'PORTEIRO_SECRET',        description: 'Chave interna de autenticação do Porteiro' },
  { key: 'PORT',                   description: 'Porta do servidor (default: 3000)' },
] as const;

const OPTIONAL_ENV_VARS = [
  { key: 'NODE_ENGINE_FALLBACK_ENABLED', description: 'true = ativa fallback N8N em erros do Node Engine' },
  { key: 'LANGFUSE_SECRET_KEY',          description: 'Para observabilidade de LLM (recomendado)' },
  { key: 'LANGFUSE_PUBLIC_KEY',          description: 'Para observabilidade de LLM (recomendado)' },
] as const;

export function validateEnvironment(): void {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const { key, description } of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      missing.push(`  ❌ ${key}: ${description}`);
    }
  }

  for (const { key, description } of OPTIONAL_ENV_VARS) {
    if (!process.env[key]) {
      warnings.push(`  ⚠️  ${key}: ${description} (não definida)`);
    }
  }

  if (warnings.length > 0) {
    console.warn('\n[ENV] Variáveis opcionais não definidas:');
    warnings.forEach(w => console.warn(w));
  }

  if (missing.length > 0) {
    console.error('\n[ENV] ❌ VARIÁVEIS OBRIGATÓRIAS FALTANDO:');
    missing.forEach(m => console.error(m));
    console.error('\nO servidor NÃO será iniciado. Corrija as variáveis acima.\n');
    process.exit(1);
  }

  console.log('[ENV] ✅ Todas as variáveis obrigatórias estão presentes.');
}
```

### 9.4 Health Checks e Métricas

```typescript
// porteiro/src/index.ts — endpoints obrigatórios para CI/CD e monitoring

// Health check simples (Docker HEALTHCHECK, Load Balancer probe)
app.get('/health', async (req, res) => {
  res.json({ status: 'ok', version: process.env.npm_package_version });
});

// Health check detalhado (para debugging em incidente)
app.get('/health/detailed', async (req, res) => {
  const [dbOk, n8nOk] = await Promise.allSettled([
    supabase.from('agents').select('id').limit(1),
    fetch(`${process.env.N8N_BASE_URL}/healthz`),
  ]);

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
    services: {
      database: dbOk.status === 'fulfilled' ? 'ok' : 'degraded',
      n8n: n8nOk.status === 'fulfilled' ? 'ok' : 'degraded',
    },
    queue: {
      activeJobs: activeJobsCount,
      maxJobs: MAX_CONCURRENT_JOBS,
    },
  });
});

// Métricas Prometheus (compatível com Grafana)
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(await metrics.getPrometheusText());
});
```

### 9.5 Graceful Shutdown

```typescript
// porteiro/src/index.ts

/**
 * Graceful Shutdown — essencial para CI/CD zero-downtime.
 *
 * Quando o container recebe SIGTERM (deploy novo chegando):
 * 1. Para de aceitar novas conexões
 * 2. Aguarda jobs em andamento terminarem (máx. 30s)
 * 3. Fecha conexões com banco
 * 4. Encerra o processo
 *
 * Sem graceful shutdown: mensagens em processamento são perdidas no deploy.
 */
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`[Shutdown] ${signal} recebido. Encerrando gracefully...`);

  // 1. Para de aceitar novas mensagens
  inboundWorker.stop();

  // 2. Aguarda jobs ativos terminarem (máx. 30s)
  const maxWaitMs = 30_000;
  const pollIntervalMs = 500;
  let waited = 0;

  while (activeJobsCount > 0 && waited < maxWaitMs) {
    logger.info(`[Shutdown] Aguardando ${activeJobsCount} jobs... (${waited}ms)`);
    await sleep(pollIntervalMs);
    waited += pollIntervalMs;
  }

  if (activeJobsCount > 0) {
    logger.warn(`[Shutdown] Timeout. ${activeJobsCount} jobs ainda ativos.`);
  }

  // 3. Fecha servidor HTTP
  server.close();

  logger.info('[Shutdown] Encerrado.');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

### 9.6 GitHub Actions — CI Pipeline

```yaml
# .github/workflows/ci.yml
# Roda em TODOS os PRs para o porteiro

name: Porteiro CI

on:
  pull_request:
    paths:
      - 'porteiro/**'

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: porteiro

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: porteiro/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Validate TypeScript
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Unit Tests
        run: npm test -- --coverage
        env:
          # Variáveis mínimas para testes (sem Supabase real)
          SUPABASE_URL: http://localhost:54321
          SUPABASE_SERVICE_KEY: test-key
          OPENAI_API_KEY: test-key

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          directory: porteiro/coverage

  docker-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image (valida o Dockerfile)
        run: docker build -t porteiro:pr-test ./porteiro
```

```yaml
# .github/workflows/deploy-porteiro.yml
# Deploy automático em push para main (já existente no projeto)

name: Deploy Porteiro

on:
  push:
    branches: [main]
    paths:
      - 'porteiro/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Tests (gate obrigatório antes do deploy)
        run: |
          cd porteiro
          npm ci
          npm test

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/davos-nexus
            git pull origin main
            cd porteiro
            docker compose -f docker-compose.prod.yml build porteiro
            docker compose -f docker-compose.prod.yml up -d --no-deps porteiro
            # Verifica que o container está saudável antes de finalizar
            sleep 10
            docker inspect --format='{{.State.Health.Status}}' nexus-porteiro | grep -q healthy
```

---

## 10. Documentação de Cada Serviço — Padrão JSDoc

Todo serviço deve seguir este padrão de documentação para ser administrável por qualquer dev:

```typescript
/**
 * @class AudioTranscriberService
 *
 * RESPONSABILIDADE:
 * Transcreve mensagens de áudio para texto usando a API Whisper da OpenAI.
 *
 * INPUTS:
 * - mediaUrl: URL pública do arquivo de áudio (opcional se mediaBase64 fornecido)
 * - mediaBase64: arquivo em base64 (opcional se mediaUrl fornecido)
 * - tenantId: necessário para registro de custo (stt_minutes)
 * - traceId: rastreio end-to-end
 *
 * OUTPUTS:
 * - transcription: texto transcrito em português
 * - durationSeconds: duração do áudio (para billing de STT)
 * - cost: custo estimado em USD
 *
 * EFEITOS COLATERAIS:
 * - Nenhum — não persiste nada no banco
 * - O PersistenceStep persiste a transcrição via record_message()
 *
 * TRATAMENTO DE ERROS:
 * - Áudio inválido → lança AudioTranscriptionError (vai para DLQ)
 * - API Whisper offline → lança ExternalServiceError (retry automático)
 * - Base64 corrompido → lança InvalidMediaError
 *
 * CONFIGURAÇÃO:
 * Variáveis de ambiente necessárias: OPENAI_API_KEY
 *
 * LATÊNCIA ESPERADA:
 * - Áudio de 30s: ~1.5s
 * - Áudio de 2min: ~4s
 *
 * CUSTO:
 * $0.006 por minuto de áudio (Whisper-1, Apr/2026)
 *
 * PARA TROCAR O PROVIDER DE STT:
 * Implemente a interface IAudioTranscriber e injete no MediaStep.
 * Não é necessário alterar nenhum outro arquivo.
 */
export class AudioTranscriberService implements IAudioTranscriber {
  // ...
}
```

---

## 11. Tabela de Migration — Banco de Dados

```sql
-- migration: 001_add_execution_mode_to_agents.sql
-- Executar em TODOS os ambientes antes de fazer deploy do Porteiro com Node Engine

ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS execution_mode VARCHAR(10)
  DEFAULT 'n8n'
  CHECK (execution_mode IN ('n8n', 'node'));

COMMENT ON COLUMN public.agents.execution_mode IS
  'Motor de execução do agente. ''n8n'' = comportamento atual. ''node'' = Node Engine nativo.
   Pode ser alternado sem deploy via UPDATE. Ver NODE_ENGINE_ARCHITECTURE.md.';

-- migration: 002_create_pipeline_execution_traces.sql
-- Tabela de observabilidade por step (substitui o "Execution view" do N8N)

CREATE TABLE IF NOT EXISTS public.pipeline_execution_traces (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id     VARCHAR(255) NOT NULL,
  tenant_id    UUID NOT NULL REFERENCES companies(id),
  agent_id     UUID NOT NULL REFERENCES agents(id),
  conversation_id UUID,
  steps        JSONB NOT NULL,   -- array de StepTrace
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_traces_trace_id ON pipeline_execution_traces (trace_id);
CREATE INDEX idx_traces_tenant   ON pipeline_execution_traces (tenant_id, created_at DESC);

-- Retenção automática: deleta traces com mais de 30 dias (LGPD)
CREATE OR REPLACE FUNCTION cleanup_old_traces() RETURNS void AS $$
  DELETE FROM pipeline_execution_traces WHERE created_at < NOW() - INTERVAL '30 days';
$$ LANGUAGE sql;
```

---

## 12. Resumo: O Que Esta Arquitetura Garante

| Preocupação | Solução | Arquivo |
|---|---|---|
| Não criar "N8N em código" | Pipeline + Steps plugáveis (não Orchestrator) | `Pipeline.ts` + `steps/` |
| Fallback silencioso | Fallback explícito + métrica `node_engine_fallback_total` | `ExecutionRouter.ts` |
| Intent classifier como gate de segurança | `PolicyEngine` determinístico separado do LLM | `PolicyEngine.ts` |
| Tool calling com loop infinito | `ToolExecutorStep` com `MAX_ITERATIONS = 5` | `ToolExecutorStep.ts` |
| context_state virando caos | Interface `ContextState` tipada + `validateContextState()` | `PipelineContext.ts` |
| Debug pior que N8N | `StepTracer`: todo step logado com input/output/duration | `StepTracer.ts` |
| Administrável por outros devs | JSDoc padrão em todo serviço + `NodeEngine.buildPipeline()` como índice | Todos services |
| CI/CD readiness | Multi-stage Dockerfile, health checks, graceful shutdown, GitHub Actions | `Dockerfile`, `.github/` |
| Escalabilidade | Cada step é stateless e pode ser extraído para serviço separado no futuro | `PipelineStep.ts` |
| Reusabilidade | Serviços injetáveis, sem acoplamento direto entre steps | `services/` |

---

*Documento v2.0 — 03/Abr/2026.*  
*Próxima ação: implementar `migration 001`, `ExecutionRouter`, `N8NEngine` wrapper e `GuardrailsStep` como Fase 0 (zero risco).*
