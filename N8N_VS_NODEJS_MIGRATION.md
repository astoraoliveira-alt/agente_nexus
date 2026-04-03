# Davos Nexus — Análise Estratégica: N8N vs Backend Node.js Nativo

> **Data:** 03/Abr/2026  
> **Contexto:** Plataforma multi-agentes com target de **1 milhão de mensagens/mês**  
> **Status:** Documento de Decisão Arquitetural — Aprovação Pendente  
> **Audiência:** CTO / Arquiteto / Tech Lead

---

## 1. Contexto: O Que o N8N Faz Hoje no Davos Nexus

Antes de qualquer análise, é fundamental mapear **exatamente** o que o N8N executa na arquitetura atual.

| Responsabilidade | Complexidade | Substituível? |
|---|---|---|
| Recebe webhook do Porteiro | Baixa | Trivial (10 linhas) |
| Chama `fn_fetch_next_inbound_message` | Baixa | Trivial |
| Chama `n8n_orchestrator_v7` | Baixa | Trivial |
| **Orquestra o AI Agent (LLM + Tools)** | **Alta** | Custoso (2-3 semanas) |
| Chama ferramentas externas (APIs financeiras) | Média | Moderado |
| Processa mídia (OCR, STT, base64) | Alta | Moderado |
| Loop de auditoria automática | Média | 3 dias |
| Worker de campanhas outbound | Média | 2 dias |
| Chama `record_message`, `fn_track_llm_usage` | Baixa | Trivial |

> **Insight crítico:** O N8N não tem fila real. A fila (`inbound_queue`) é o Postgres. O N8N é apenas um **executor HTTP** chamado pelo Porteiro. A infraestrutura de fila já pertence ao Davos Nexus.

---

## 2. O Que Você Perde na Migração

### 2.1 Perda Real: Interface Visual de Fluxo

**Hoje no N8N você enxerga a lógica visualmente:**

```
[IF: queue_id está vazio?]
    ├─ TRUE  → [Stop silencioso]
    └─ FALSE → [Orchestrator RPC]
                    ↓
              [IF: Security ativa?]
                    ├─ TRUE  → [Switch1: should_use_tools?]
                    │              ├─ TRUE  → [AI Agent com Tools]
                    │              └─ FALSE → [AI Agent sem Tools]
                    └─ FALSE → [Security Gatekeeper]
```

**Em Node.js vira código TypeScript** — legível para devs, mas sem mapa visual:

```typescript
async function orchestrate(message: InboundMessage) {
  if (!message.queue_id) return; // silent finish

  const context = await fetchContext(message);

  if (context.security.session_status !== 'active') {
    return await securityGatekeeperFlow(context);
  }

  if (context.agent.should_use_tools) {
    return await aiAgentWithTools(context);
  }
  return await aiAgentWithoutTools(context);
}
```

### 2.2 Perda Real: Janela de Execução em Tempo Real

O N8N permite:
- Ver cada execução com input/output por nó
- Re-executar a partir de qualquer ponto
- Filtrar execuções por erro/sucesso
- Debug visual sem precisar de terminal

Em Node.js, isso precisa ser **construído ou substituído por Langfuse**.

### 2.3 Perda Real: Adicionar Ferramenta (Tool) sem Deploy

No N8N, adicionar uma nova ferramenta ao AI Agent é uma operação visual — sem código, sem deploy.

Em Node.js, toda nova ferramenta requer:
```
código → PR → review → merge → CI/CD → deploy
```

---

## 3. O Que Você NÃO Perde (Contraintuitivo)

Esta é a parte mais importante: **a maioria do que parece estar "no N8N" já está no seu banco de dados.**

| Funcionalidade | Parece estar no N8N | Na verdade está em… |
|---|---|---|
| System Prompt do agente | ✅ N8N | `agents.brain_config.systemPrompt` — **sua UI já edita** |
| Temperatura / modelo LLM | ✅ N8N | `agents.brain_config.modelId / temperature` — **sua UI já edita** |
| Regras de comportamento | ✅ N8N | `policies` (banco) — **sua UI já edita** |
| Ferramentas disponíveis | ✅ N8N | `agent_tools` (banco) — **sua UI já lista** |
| Governança / risco | ✅ N8N | `agents` (banco) — **sua UI já edita** |

> **Conclusão:** O N8N lê `brain_config` do banco e executa. Um Node.js faria exatamente o mesmo. **Você não perderia a capacidade de configurar prompts** — perderia apenas a interface do N8N para visualizá-los (que a sua UI já substituiu).

---

## 4. Tabela Completa: Perda Real vs. Não Perde

| Funcionalidade N8N | Perda Real? | Alternativa |
|---|---|---|
| Editar System Prompt visualmente | ❌ Não perde | Prompt já está em `brain_config` — UI do Davos edita |
| Editar temperatura / modelo | ❌ Não perde | Já está em `brain_config` — UI do Davos edita |
| Ver lógica de IF/Switch visualmente | ✅ **Perde** | Vira TypeScript — legível mas sem canvas |
| Ver execuções em tempo real | ✅ **Perde** | Langfuse (self-hosted) ou painel próprio |
| Re-executar uma mensagem específica | ✅ **Perde** | Precisaria construir no AdminPanel |
| Adicionar nova ferramenta sem deploy | ✅ **Perde** | Vira código + deploy (com CI/CD: 5 min) |
| Ver input/output de cada step LLM | ✅ **Perde parcialmente** | Langfuse cobre 80% do debug de LLM |
| Mudar URL de API externa | ❌ Não perde | Variável de ambiente ou banco |
| Dashboard de execuções ok/erro | ✅ **Perde** | `inbound_queue_errors` já existe — pode expor na UI |
| Testar fluxo manualmente | ✅ **Perde** | Playground da UI + curl |
| Configuração de memória de conversa | ❌ Não perde | `PostgresChatMessageHistory` do LangChain.js — mesma tabela |
| Filas de mensagens | ❌ Não perde | A fila já é o Postgres (`inbound_queue`) |
| Webhook de entrada | ❌ Não perde | Já está no Porteiro — são 10 linhas |

---

## 5. Análise de Escala: N8N vs Node.js

### 5.1 Teto Real do N8N

```
Configuração atual (1 VPS Utah):
  Throughput máximo: ~20-30 msgs/segundo
  = ~1.7M - 2.6M msgs/mês

Com workers paralelos (3× VPS N8N):
  Throughput: ~60-90 msgs/segundo
  = ~5M - 7.7M msgs/mês
  Custo: ~$400-600/mês em VPS

Limitações estruturais do N8N:
  - Cada execução usa 50-200MB RAM por workflow ativo
  - Logs acumulam rápido (requer flush periódico)
  - Sem sharding nativo por tenant
  - Isolamento zero: tenant grande consome recursos do tenant pequeno
```

### 5.2 Teto do Node.js com BullMQ

```typescript
// Escala horizontal nativa com BullMQ + Redis Cluster
const workers = Array.from({ length: 20 }, () =>
  new Worker('inbound-messages', processor, {
    connection: redisCluster,
    concurrency: 50, // 50 msgs simultâneas POR worker
  })
);
// Total: 20 workers × 50 = 1.000 msgs simultâneas
```

| Configuração | Throughput | Custo Infra | Teto Mensal |
|---|---|---|---|
| N8N atual (1 VPS) | ~25 msgs/s | ~$150/mês | ~2.2M msgs |
| N8N escalado (3× VPS) | ~75 msgs/s | ~$450/mês | ~6.5M msgs |
| Node.js (1 VPS 4CPU/8GB) | ~200 msgs/s | ~$80/mês | ~17M msgs |
| Node.js (3 VPS + Redis) | ~600 msgs/s | ~$250/mês | ~51M msgs |
| Node.js (K8s auto-scale) | ilimitado | pay-as-you-go | sem teto |

> **O gargalo em Node.js deixa de ser a infraestrutura de orquestração e passa a ser o OpenAI rate limit e o Supabase connection pool** — ambos solucionáveis com pgBouncer e caching de embeddings.

### 5.3 Comparativo de Custo na Mesma Escala

| Volume | Custo N8N | Custo Node.js | Economia |
|---|---|---|---|
| 1M msgs/mês | ~$150/mês | ~$80/mês | $70/mês |
| 5M msgs/mês | ~$450/mês | ~$120/mês | $330/mês |
| 20M msgs/mês | N8N não suporta | ~$250/mês | N/A |

---

## 6. Stack Completo para Substituir o N8N

Se a decisão for migrar, este é o stack exato que faz sentido para o Davos Nexus:

```
┌─────────────────────────────────────────────────────────┐
│  Porteiro V3 (Node.js + Fastify — já existe)            │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Webhook API │  │ BullMQ Queue │  │  AI Engine    │  │
│  │ (já existe) │  │ substitui    │  │  LangChain.js │  │
│  │             │  │ N8N worker   │  │  + Tools      │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
│                                                         │
│  Redis (BullMQ)  ←────→  Postgres (inbound_queue)      │
│                                                         │
│  Langfuse (observabilidade LLM — open source)           │
└─────────────────────────────────────────────────────────┘
```

### 6.1 AI Agent em LangChain.js (Substituto Direto)

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createOpenAIToolsAgent } from "langchain/agents";
import { PostgresChatMessageHistory } from "@langchain/community/stores/message/postgres";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// Ferramentas (equivalente aos "Tool Calls" do N8N)
const consultarSaldoTool = tool(
  async ({ cnpj }) => {
    const result = await supabase.rpc('financial_get_customer_summary_safe', { p_cnpj: cnpj });
    return JSON.stringify(result.data);
  },
  {
    name: "consultar_saldo",
    description: "Consulta saldo e dados financeiros do cliente pelo CNPJ",
    schema: z.object({ cnpj: z.string().describe("CNPJ do estabelecimento") })
  }
);

// Agente com memória de conversa (equivalente ao Postgres Chat Memory do N8N)
const agent = await createOpenAIToolsAgent({
  llm: new ChatOpenAI({ model: agentConfig.brain_config.modelId }),
  tools: [consultarSaldoTool, /* ... outras ferramentas */],
  prompt: buildPromptFromBrainConfig(agentConfig.brain_config), // lê do banco
});

const executor = new AgentExecutor({ agent, tools });

// Memória persistente na mesma tabela que o N8N usa
const withHistory = new RunnableWithMessageHistory({
  runnable: executor,
  getMessageHistory: (sessionId) =>
    new PostgresChatMessageHistory({
      sessionId,
      tableName: "chat_histories_memory", // mesma tabela atual
    }),
  inputMessagesKey: "input",
  historyMessagesKey: "chat_history",
});

// Invocação
const response = await withHistory.invoke(
  { input: userMessage },
  { configurable: { sessionId: conversationId } }
);
```

### 6.2 Fila com BullMQ (Substituto + Upgrade do Worker N8N)

```typescript
import { Queue, Worker, QueueEvents } from "bullmq";

const inboundQueue = new Queue("inbound-messages", { connection: redis });

const worker = new Worker(
  "inbound-messages",
  async (job) => {
    const { queueId, n8nExecutionId } = job.data;
    await processInboundMessage(queueId, n8nExecutionId);
  },
  {
    connection: redis,
    concurrency: 50,           // 50 msgs simultâneas
    limiter: {
      max: 100,
      duration: 1000,          // rate limit: 100/segundo
    },
  }
);

// Retry automático com backoff exponencial — melhor que o N8N
worker.on("failed", async (job, err) => {
  if (job && job.attemptsMade < 3) {
    await job.retry(); // BullMQ faz backoff exponencial nativo
  } else {
    await markAsDLQ(job?.data.queueId, err.message);
  }
});
```

### 6.3 Audit Worker (Substituto do Loop do N8N)

```typescript
const auditWorker = new Worker(
  "audit-conversations",
  async (job) => {
    const { conversationId } = job.data;
    const { data: transcript } = await supabase
      .rpc('get_conversation_transcript', { p_conversation_id: conversationId });

    const evaluation = await runAuditLLM(transcript);
    await supabase.rpc('save_evaluation', evaluation);
  },
  {
    connection: redis,
    concurrency: 5,            // 5 auditorias simultâneas
  }
);

// Cron para fechar conversas inativas (substitui o scheduler do N8N)
const closerQueue = new Queue("close-idle-conversations", {
  connection: redis,
  defaultJobOptions: {
    repeat: { pattern: "*/5 * * * *" }, // a cada 5 minutos
  },
});
```

---

## 7. Compensando a Perda de Visibilidade

### 7.1 Langfuse — Observabilidade de LLM (Open Source)

```typescript
import { Langfuse } from "langfuse";

const langfuse = new Langfuse({
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  baseUrl: "https://cloud.langfuse.com", // ou self-hosted na sua VPS
});

// Rastrear cada chamada LLM automaticamente
const trace = langfuse.trace({
  name: "inbound-message-processing",
  userId: contactPhone,
  sessionId: conversationId,
  metadata: { tenantId, agentId, provider: whatsappProvider },
});

const generation = trace.generation({
  name: "sofia-response",
  model: agentConfig.brain_config.modelId,
  input: systemPrompt + userMessage,
  output: aiResponse,
  usage: { promptTokens, completionTokens },
});
```

**O Langfuse entrega:**
- Timeline de cada execução (equivalente ao canvas do N8N)
- Input/output de cada tool call
- Custo por sessão, por agente, por tenant
- Dashboard de latência P50/P95/P99
- Replay de execuções

### 7.2 Painel de Execuções no Davos Nexus (Diferencial de Produto)

Em vez de depender do N8N como janela de debug, construir a visibilidade **dentro do AdminPanel** — o que é um **diferencial de produto** real:

```
┌──────────────────────────────────────────────────────┐
│  Davos Nexus → /ai-performance → Aba "Execuções"    │
│                                                      │
│  Conversa #1234 — Astor Silva (Edenred)             │
│  ├─ [✅] Webhook recebido              12ms          │
│  ├─ [✅] Context carregado (banco)     45ms          │
│  ├─ [✅] Security check (ativa)         8ms          │
│  ├─ [✅] LLM call gpt-4o              892ms          │
│  │      Prompt tokens: 1.243                         │
│  │      Tool calls: [consultar_saldo → R$ 45.000]    │
│  ├─ [✅] Tool executada               234ms          │
│  └─ [✅] Resposta enviada              12ms          │
│  Total: 1.203ms  |  Custo: $0.0023  |  Tokens: 1.891│
└──────────────────────────────────────────────────────┘
```

Dados já existem em `inbound_queue`, `consumption_metrics` e `inbound_queue_errors`. É questão de expor na UI.

---

## 8. Plano de Migração em 3 Fases

A estratégia recomendada é **expansão incremental do Porteiro**, sem big bang.

### Fase 1 — Porteiro Absorve o Periférico (2 semanas)
**O N8N continua rodando. Zero risco.**

| Tarefa | Esforço | O que elimina do N8N |
|---|---|---|
| Porteiro processa campanhas outbound nativamente | 2 dias | Worker de campanha do N8N |
| Porteiro fecha conversas inativas (cron BullMQ) | 1 dia | Scheduler do N8N |
| Porteiro dispara auditoria ao fechar conversa | 1 dia | Trigger de auditoria do N8N |
| Setup Langfuse (self-hosted na VPS) | 2 dias | Observabilidade LLM |

**Resultado:** -40% de carga no N8N. Custo idêntico. Risco zero.

### Fase 2 — AI Engine em Node.js (3-4 semanas)
**N8N ainda ativo como fallback.**

| Tarefa | Esforço | Detalhes |
|---|---|---|
| LangChain.js AgentExecutor + Tools | 2 semanas | Porta cada tool do N8N para TypeScript |
| PostgresChatMessageHistory | 1 dia | Mesma tabela `chat_histories_memory` |
| Security Gatekeeper em código | 3 dias | Lógica de sessão e validação de CNPJ |
| Testes de carga (10K msgs) | 3 dias | Valida throughput antes de cortar N8N |
| Migração gradual (10% → 50% → 100%) | 1 semana | Feature flag por tenant |

**Resultado:** N8N em standby. Node.js processa tudo. Gargalo de latência eliminado.

### Fase 3 — N8N Aposentado (1 semana)
**Pós-validação da Fase 2.**

| Tarefa | Esforço |
|---|---|
| Desativar VPS N8N | 1 hora |
| Migrar variáveis de ambiente para Porteiro | 1 dia |
| Atualizar documentação arquitetural | 1 dia |
| Painel de execuções no AdminPanel | 1 semana |

**Resultado:** -$100-150/mês em infra. +300% throughput. Observabilidade completa.

---

## 9. Estimativa de Esforço Total

| Componente | Esforço | Complexidade |
|---|---|---|
| Webhook receiver | 0 (já no Porteiro) | — |
| BullMQ Queue setup | 2 dias | Baixa |
| LangChain.js AI Agent | 2-3 semanas | **Alta** |
| Tool calling (por ferramenta) | 1-2 dias cada | Média |
| Postgres Chat Memory | 1 dia | Baixa |
| Security Gatekeeper | 3 dias | Média |
| Audit worker | 3 dias | Média |
| Campaign worker | 2 dias | Média |
| Langfuse setup | 2 dias | Baixa |
| Painel de execuções na UI | 1 semana | Média |
| Testes + validação em produção | 1 semana | — |
| **TOTAL ESTIMADO** | **7-9 semanas** | |

---

## 10. Critérios de Decisão — Quando Migrar?

```
MIGRAR AGORA se:
  ✅ Volume já passou de 500K msgs/mês
  ✅ Você tem 3+ clientes no porte do Edenred
  ✅ Latência de 800ms-2s está causando reclamação de clientes
  ✅ Custo do N8N já passa de $200/mês
  ✅ Você tem 1+ dev sênior disponível por 2 meses

ESPERAR se:
  ⏳ Volume ainda abaixo de 500K msgs/mês
  ⏳ Time pequeno sem capacidade de manter N8N + migração em paralelo
  ⏳ Clientes novos em negociação (risco de instabilidade é alto)
  ⏳ Você ainda itera muito rápido no prompt (o N8N facilita isso)
```

---

## 11. Dependências que NÃO Mudam com a Migração

Estes componentes são **agnósticos ao N8N** e permanecem intactos:

- `database/create_queue_supervisor_rpc.sql` — toda a lógica de fila e lock
- `inbound_queue` / `inbound_queue_errors` — DLQ e rastreabilidade
- `agents.brain_config` — configuração de LLM (o Node.js lê igual ao N8N)
- `consumption_metrics` — billing e telemetria
- `chat_histories_memory` — memória de conversa (mesma tabela)
- `fn_track_llm_usage` — telemetria de tokens
- `record_message` — gravação de mensagens
- Porteiro (`porteiro/src/index.ts`) — gateway de entrada/saída
- Toda a UI do Davos Nexus — nenhuma mudança visual

---

## 12. Riscos da Migração

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Regressão de comportamento do AI Agent | Média | Testes A/B por tenant antes de cortar N8N |
| Perda de contexto de conversa | Baixa | Mesma tabela `chat_histories_memory` |
| Ferramentas com comportamento diferente | Média | Testes unitários por tool antes da Fase 2 |
| Downtime durante migração | Baixa | Feature flag — rollback instantâneo |
| Custo de desenvolvimento | Alta (tempo) | 7-9 semanas de eng. sênior |

---

## 13. Veredicto Final

> **O N8N é hoje uma ferramenta indispensável pela sua interface visual de debug e agilidade de prototipagem. Para o volume atual do Davos Nexus (Edenred + poucos clientes), o custo-benefício de manter o N8N é positivo.**
>
> **Para 1M msgs/mês com 10+ tenants ativos, a migração é inevitável e estratégica.** O teto do N8N (~5M msgs/mês em configuração custosa) é atingível, mas o custo de infra, a falta de isolamento por tenant e a dependência de uma ferramenta terceira são riscos de plataforma.
>
> **A migração mais segura é incremental (3 fases) e leva 7-9 semanas.** O ROI se paga em 4-6 meses de economia de infra + ganho de throughput.
>
> **Recomendação para hoje:** iniciar a Fase 1 (overhead periférico) em paralelo com a operação atual. Isso gera ganho imediato com risco zero e prepara o terreno para as fases seguintes.

---

*Documento gerado em 03/Abr/2026. Atualizar quando a decisão de migração for tomada.*
