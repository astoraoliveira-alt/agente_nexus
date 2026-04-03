# Davos Nexus — Análise Estratégica: N8N vs Backend Node.js Nativo

> **Data:** 03/Abr/2026  
> **Revisão Crítica:** 03/Abr/2026 — Modelo revisado para Coexistência + Execution Router  
> **Contexto:** Plataforma multi-agentes com target de **1 milhão de mensagens/mês**  
> **Status:** Documento de Decisão Arquitetural — v2.0 (Revisado)  
> **Audiência:** CTO / Arquiteto / Tech Lead

> ⚠️ **Nota de Revisão:** A v1.0 deste documento subestimou o esforço de migração do AI Engine (2-3 semanas → real: 4-6 semanas), propôs BullMQ prematuramente e tratou o N8N como algo a ser eliminado. A v2.0 corrige esse frame: **o modelo correto é coexistência estratégica, não substituição.**

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

## 5.3 O Gargalo Real em 1M msgs/mês (Não é o N8N)

A análise de escala do documento original foi **incompleta**. Migrar para Node.js não reduz a latência percebida pelo usuário — porque o gargalo real não é CPU:

| Gargalo | Latência | Resolvido por Node.js? |
|---|---|---|
| LLM inference (OpenAI gpt-4o) | 500ms-2s | ❌ Não — é o provider |
| APIs externas (financeiro, CEP) | 200-800ms | ❌ Não — é o terceiro |
| Supabase connection pool | limite ~300 conn. | ❌ Não — resolve pgBouncer |
| Zenvia/Evolution rate limit | por provider | ❌ Não — é o BSP |
| **Overhead do N8N (HTTP hops)** | **100-400ms** | ✅ Sim — isso Node.js resolve |

**Conclusão correta:** Node.js elimina o overhead da camada de orquestração (~100-400ms). Os outros gargalos continuam existindo e precisam de soluções específicas (caching, pgBouncer, rate limit handling).

---

## 6. O Papel que o N8N Tem e Foi Subestimado

Esta é a correção mais importante em relação à análise original.

### 6.1 N8N como Ambiente de Experimentação de Produto

O N8N não é só um runtime — é um **laboratório de produto de IA**:

```
Com N8N (hoje):
  Mudar system prompt    → edita campo → salva → produção imediata. Zero deploy.
  Adicionar nova tool    → drag & drop → conecta → produção.
  Testar novo modelo     → troca campo → executa → valida.
  Ajustar temperatura    → slider → salva → produção.
  Testar nova lógica     → duplica fluxo → experimento → valida → promove.

Com Node.js puro:
  Mudar system prompt    → código → PR → review → merge → CI/CD → deploy.
  Adicionar nova tool    → código → testes → PR → merge → deploy.
  Testar novo modelo     → branch → código → deploy → valida.
```

**Para uma plataforma SaaS de IA que itera rápido em produto, essa diferença é crítica.** Matar o N8N completamente mata a velocidade de experimentação.

### 6.2 O Modelo Mental Correto

```
❌ Modelo Errado (v1.0 deste doc):
   Porteiro → N8N → [migrar tudo pro Node]

✅ Modelo Correto (v2.0):
   Porteiro → Execution Router
                   ├─ Node Engine  (flows críticos, estáveis)
                   └─ N8N          (flows exploratórios, novos, experimentos)
```

O N8N **permanece** como laboratório. O Node.js assume apenas o que é maduro e crítico.

---

## 7. Stack Completo para o Node Engine (Flows Críticos)

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

### 7.1 LangChain.js Não Substitui o N8N Sozinho

Esta foi a maior imprecisão da análise original. LangChain resolve o **LLM + Tool Calling** — mas o N8N resolve o **flow control de negócio**:

```
N8N resolve hoje:
  ✅ IF queue_id vazio → stop silencioso
  ✅ IF security.status !== 'active' → desviar para Gatekeeper
  ✅ SWITCH should_use_tools → rota A ou B
  ✅ IF resposta vazia → retry com fallback message
  ✅ IF sub-node crash → DLQ automática

LangChain resolve:
  ✅ LLM decide qual tool chamar
  ✅ Tool executa e retorna resultado
  ✅ LLM raciocina sobre o resultado

  ❌ Branching lógico de negócio (IFs de governança)
  ❌ Retry de fluxo (não de chamada LLM)
  ❌ Enforcement de políticas multi-tenant
  ❌ Controle de concorrência por agente
```

**Você inevitavelmente cria um mini-orchestrator Node.js** para cobrir o que LangChain não faz. O esforço real é: `LangChain.js + orchestration layer própria`.

### 7.2 AI Agent com LangChain.js + Mini-Orchestrator

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

### 7.3 Sobre BullMQ — Não Usar Ainda

> ⚠️ **Correção em relação à v1.0:** A análise original propôs BullMQ prematuramente.

O `inbound_queue` com `FOR UPDATE SKIP LOCKED` **já é uma fila de produção robusta**. Adicionar BullMQ criaria duas filas com a mesma responsabilidade:

```
Postgres queue → lock atômico, priority, DLQ, retry, status tracking
BullMQ queue  → lock atômico, priority, DLQ, retry, status tracking

Dois sistemas, mesma função, dois pontos de verdade → inconsistência e debug difícil.
```

**BullMQ só entra quando você tiver:**
- Backlog real de mensagens acima de 100K/hora
- Necessidade de retry com backoff exponencial configurável por job
- Múltiplos processos Node.js físicos (não threads) consumindo a mesma fila
- Rate limiting granular por tenant (que o Postgres não oferece nativamente)

**Antes disso: use o Postgres. A fila já é sua.**

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

## 8. A Perda de Debug é Mais Séria que o Estimado

A análise original afirmou "Langfuse cobre 80% do debug". Isso foi otimista.

```
Langfuse cobre bem:
  ✅ Qual tool foi chamada e com quais parâmetros
  ✅ Input/output de cada chamada LLM
  ✅ Tokens consumidos e custo
  ✅ Latência de cada step de LLM
  ✅ Histórico de sessão por usuário

Langfuse NÃO cobre:
  ❌ "Por que o IF tomou o caminho X em vez do Y?"
  ❌ Estado intermediário entre RPCs (o que tinha em v_agent, v_conv)
  ❌ Replay real a partir de qualquer nó (é watching, não re-executing)
  ❌ Debug visual de branching lógico de negócio
```

**Em incidente de produção** (ex: mensagem enviada errada, contexto perdido, segurança bypassada), o N8N canvas permite identificar o problema em minutos. No Node.js com Langfuse, você precisa de logging estruturado muito disciplinado e ainda assim perde o contexto visual.

**Mitigação real:** construir o painel de execuções **dentro do Davos Nexus AdminPanel** é a resposta certa — mas é adicional 1-2 semanas de desenvolvimento.

### 8.1 Langfuse — Observabilidade de LLM (Open Source)

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

## 9. Plano de Migração Revisado — Coexistência Estratégica

O modelo revisado **não é "matar o N8N"**. É separar os flows por criticidade e usar o N8N permanentemente como laboratório.

### Passo 1 — Criar o Execution Router no Porteiro (3 dias)

Este é o habilitador de tudo. Sem risco, sem mudança de comportamento.

```typescript
// porteiro/src/index.ts
async function routeMessage(agent: Agent, context: MessageContext) {
  // Campo novo na tabela agents: execution_mode = 'n8n' | 'node'
  if (agent.execution_mode === 'node') {
    return await processInNodeEngine(context); // Node Engine (crítico)
  }
  return await callN8NWebhook(context); // N8N (padrão atual, inalterado)
}
```

**O que isso dá:**
- Rollout por agente (não por tenant inteiro)
- Fallback instantâneo: muda `execution_mode` no banco = sem deploy
- Zero risco: todos os agents começam em `execution_mode = 'n8n'`

### Passo 2 — Classificar os Fluxos (1 semana de análise)

| Fluxo | Tipo | Onde Rodar | Motivo |
|---|---|---|---|
| Inbound principal (resposta cliente) | A — Crítico | Node Engine | Latência, isolamento tenant |
| Identity Gate / Security Gatekeeper | A — Crítico | Node Engine | Sem tolerância a falha |
| Ferramentas financeiras (tools) | A — Crítico | Node Engine | Retry inteligente, auditoria |
| Campanha outbound | B — Flexível | N8N (migra depois) | Controlado, pode falhar |
| Auditoria de conversas | B — Flexível | N8N (migra depois) | Baixa frequência, não-crítico |
| Novos fluxos em desenvolvimento | B — Exploratório | **N8N permanente** | Velocidade de iteração |
| Testes de prompt / modelo / temp | B — Exploratório | **N8N permanente** | Laboratório de produto |
| Experimentos com novas ferramentas | B — Exploratório | **N8N permanente** | Risco zero de produção |

### Passo 3 — Matar o Que Dói Primeiro (ordem real de migração)

```
1. Campanha outbound → Node (baixo risco, alto volume, isola tenant)
2. Auditoria automática → Node (worker simples, sem LLM complexo)
3. Workers batch (close_idle, recovery) → Node (são crons simples)
4. Inbound crítico (resposta principal) → Node Engine (é o passo difícil)
5. N8N fica: experimentos, novos flows, laboratório de IA
```

### Passo 4 — BullMQ: Só Quando Necessário

**Não adicionar BullMQ enquanto:**
- O `inbound_queue` com `FOR UPDATE SKIP LOCKED` estiver dando conta
- Não houver backlog real de mensagens
- Não houver múltiplos processos Node.js físicos

**Adicionar BullMQ quando:**
- Volume > 500K msgs/dia com atraso mensurável na fila
- Necessidade de retry com backoff por job individual
- 3+ instâncias do Porteiro rodando em paralelo

---

## 10. Estimativa de Esforço Total (Revisada)

| Componente | Esforço Real | Complexidade | Observação |
|---|---|---|---|
| Execution Router no Porteiro | 3 dias | Baixa | Habilitador de tudo — primeiro passo |
| Campaign worker (Node.js) | 2 dias | Baixa | Primeiro a migrar — menor risco |
| Audit worker (Node.js) | 3 dias | Baixa | Segundo a migrar |
| Batch workers (crons) | 2 dias | Baixa | close_idle, recovery |
| Langfuse setup | 2 dias | Baixa | Observabilidade LLM |
| Mini-orchestrator (flow control) | 2 semanas | **Alta** | IFs, switches, governança |
| LangChain.js AI Agent + Tools | 2-3 semanas | **Alta** | Tool calling, memory, retry |
| Security Gatekeeper em código | 1 semana | **Alta** | Sessões, CNPJ, bloqueio |
| Multi-provider routing (Zenvia) | 3 dias | Média | Já parcialmente no Porteiro |
| Testes de carga + validação | 1 semana | Média | A/B por tenant antes de cortar |
| Painel de execuções na UI | 1-2 semanas | Média | Compensação de debug visual |
| **TOTAL ESTIMADO (realista)** | **9-12 semanas** | | Fases 1+2+3 do Passo 3 |

---

## 10. Critérios de Decisão — Quando Migrar?

```
INICIAR AGORA (Passo 1 — Execution Router):
  ✅ Sempre — zero risco, 3 dias, habilita rollout gradual

MIGRAR FLOWS PERIFÉRICOS (campanhas, auditoria) quando:
  ✅ Volume > 200K msgs/mês (custo começa a doer)
  ✅ Você tem 1 dev disponível por 2-3 semanas

MIGRAR O AI ENGINE (inbound crítico) quando:
  ✅ Volume > 500K msgs/mês consistentemente
  ✅ Você tem 2+ clientes no porte do Edenred
  ✅ Overhead do N8N (latência HTTP) é mensurável e relevante
  ✅ Dev sênior disponível por 2-3 meses

MANTER N8N PERMANENTEMENTE para:
  🔬 Novos fluxos em desenvolvimento
  🧪 Experimentos de prompt e modelo
  📊 Testes A/B de lógica de conversação
  🚀 Prototipagem de novas ferramentas antes de codar

ESPERAR BULLMQ até:
  ⏳ Volume > 500K msgs/dia COM atraso mensurável na fila
  ⏳ 3+ instâncias do Porteiro em paralelo
  ⏳ Necessidade de retry granular por job individual
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

## 13. Veredicto Final (Revisado v2.0)

### O Que a v1.0 Errou
- Subestimou o esforço do AI Engine (2-3 semanas → real: 4-6 semanas para o contexto do Davos Nexus)
- Propôs BullMQ prematuramente (a fila já é o Postgres)
- Tratou a latência como problema de orquestração (o gargalo real é LLM + I/O externo)
- Subestimou a perda de debug (Langfuse não cobre branching lógico)
- Propôs "matar o N8N" em vez de "coexistência estratégica"

### O Modelo Correto

> **O N8N não deve ser eliminado — deve ser especializado.**
>
> **Node Engine** para o que é crítico, estável e de alto volume.
> **N8N** permanece como laboratório de produto de IA — para experimentos, novos flows e prototipagem rápida.
>
> O habilitador é o **Execution Router** no Porteiro: 3 dias de desenvolvimento, zero risco, rollout por agente.

### Resumo Executivo

| Decisão | Agora | 3-6 meses | 12 meses |
|---|---|---|---|
| Execution Router | ✅ Implementar | — | — |
| Migrar campanhas/auditoria | Planejar | ✅ Executar | Done |
| Migrar AI Engine crítico | — | Planejar | ✅ Executar |
| BullMQ | ❌ Não ainda | Avaliar | Se necessário |
| Desligar N8N (total) | ❌ Nunca* | ❌ Nunca* | ❌ Nunca* |
| N8N como laboratório | ✅ Manter | ✅ Manter | ✅ Manter |

*N8N deve permanecer como laboratório de experimentação indefinidamente.

---

*Documento v2.0 — Revisado em 03/Abr/2026 após análise crítica da arquitetura.*
*Próxima revisão: quando o Execution Router estiver implementado e os primeiros flows migrados.*
