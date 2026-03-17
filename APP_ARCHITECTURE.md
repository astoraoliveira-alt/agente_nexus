# Agent Nexus Hub — Documentação da Arquitetura (Completa & Detalhada)

> **Última Atualização:** 16/Mar/2026
> **Versão:** 14.0 (N8N Orchestrator V5, Security Flow Redesign, Session Expiry Fix)
> **Status:** Mestre — Fonte Única da Verdade
> **Fontes Primárias:** `database/complete_schema.sql` · `src/services/api.ts` · `src/lib/types.ts`

---

## 1. Visão Geral e Estratégia de Produto

**Davos Nexus** é uma plataforma SaaS Enterprise ("AI Control Tower") projetada para orquestração, monitoramento seguro e governança de agentes de IA em escala.

### 1.1 Missão do Sistema
Resolver a fragmentação do uso de IA corporativa, oferecendo um ponto único para gerenciar IAs que operam no **WhatsApp**, **Telefonia (Voz)** e **Web**, garantindo compliance (ISO 42001 e LGPD) e controle financeiro.

### 1.2 Arquitetura Multi-Tenant (Row Level Security)
O sistema opera sob isolamento estrito de dados. **Todos** os queries SQL filtram por `tenant_id` via RLS.

- **Tenant (Empresa):** A unidade atômica de isolamento. Mapeada para a tabela `companies`.
- **Hierarquia de Usuários:**
  - **Super Admin (Davos):** Visão global, capacidade de "impersonate" (entrar em tenants). `tenant_id = NULL`.
  - **Tenant Admin:** Gestão total do ambiente da sua empresa.
  - **Operador:** Focado em atendimento humano (HITL — Human in the Loop). Pode assumir conversas.
  - **Visualizador:** Apenas leitura de dashboards.

---

## 2. Stack Tecnológico & Arquitetura de Camadas

A arquitetura do Nexus Hub é um modelo híbrido **Service-Oriented Frontend + Database-First Backend** em ambiente Geo-Distribuído.

### 2.1 Stack Completa

| Camada | Componente | Tecnologia | Localização | Papel & Detalhes Técnicos |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend** | UI App | **React 18 + Vite + TypeScript** | 🇺🇸 Vercel (CDN Global) | SPA estático. Build via Vite (SWC). Roteamento com `react-router-dom` v6. |
| | UI Components | **shadcn/ui + Radix UI** | — | Sistema de design acessível. Primitivos headless com Tailwind CSS. |
| | State/Data | **TanStack Query v5 + React Context** | — | Cache de server state. `AppContext` gerencia auth, tenant e conversas em polling. |
| | Formulários | **React Hook Form + Zod** | — | Validação tipada no cliente antes de qualquer chamada à API. |
| | Gráficos | **Recharts** | — | Dashboards financeiros, heatmaps de consumo e barras de uso. |
| | 3D | **@splinetool/react-spline** | — | Elementos visuais 3D na landing. |
| **Backend** | Banco de Dados | **PostgreSQL 15+** | 🇺🇸 Supabase (US West) | Core do sistema. Armazenamento centralizado. |
| | API Layer | **PostgREST** | 🇺🇸 Supabase (US West) | Exposição automática do schema via REST. Segura por RLS. |
| | RPC Layer | **PL/pgSQL Functions** | 🇺🇸 Supabase (US West) | Lógica de negócio crítica (orquestração, financeiro, auditoria) executada no banco. |
| | Auth | **Supabase Auth + `public.users`** | 🇺🇸 Supabase (US West) | Sessão JWT gerenciada pelo Supabase. Perfil de negócio em `public.users`. |
| | Edge Functions | **Deno / Node.js** | 🇺🇸 Supabase Edge | Webhooks e `check-health` de monitoramento. |
| | Storage | **Supabase Storage** | 🇺🇸 Supabase (US West) | Bucket `incident-attachments` para uploads de evidências de incidentes. |
| **Orquestração** | Workflow Engine | **n8n (Node.js)** | 🇺🇸 VPS (Utah, US) | Motor de fluxos que orquestra a lógica de IA. Consome as RPCs do Postgres. |
| | Caching / Scale | **Redis** | 🇺🇸 VPS (Utah, US) | Atua em conjunto com o n8n para **paralelizar** a execução e escalar chamadas em massa. |
| **Canais** | WhatsApp | **Evolution API (Node)** | 🇺🇸 VPS (Utah, US) | Gateway de mensagem WhatsApp. |
| | Voz | **VAPI** | 🇺🇸 USA (Global) | Processamento de voz. Integração bidirecional via webhook `sync_vapi_call`. |
| **Inference** | LLM Brain | **OpenAI API (GPT-4o, text-embedding-3-small)** | 🇺🇸 USA | Raciocínio, geração de embeddings (client-side), sugestão de políticas. |
| | Alternativo | **Anthropic (Claude 3.5)** | 🇺🇸 USA | Configurável por agente no campo `brain_config.modelId`. |

### 2.2 Frontend: Dependências de Produção

```
react@18, react-router-dom@6, @tanstack/react-query@5
@supabase/supabase-js@2, react-hook-form@7, zod@3
recharts@2, lucide-react, sonner, vaul
pdfjs-dist@5, mammoth@1, xlsx@0.18, papaparse@5
gpt-tokenizer@3, @splinetool/react-spline@4
```

### 2.3 Latência & Estratégia de Rede

| Rota | Latência Alvo | Observação |
| :--- | :--- | :--- |
| User → Frontend (Vercel CDN) | ~100–150ms | Carregamento inicial |
| User → Database (Supabase US West) | ~120-180ms | Operações CRUD e Sync de UI |
| Supabase ↔ N8N / Evolution (Utah) | <20ms | Comunicação Backend ultra-rápida (Mesma Costa) |
| Supabase/N8N → LLM (OpenAI/Anthropic) | ~200-400ms | Inferência e APIs na mesma região reduzem latência do salto geográfico |

Esta arquitetura garante altíssima coesão e velocidade entre os motores vitais do sistema (Banco + N8N + LLM), pois todos compartilham o eixo Oeste dos Estados Unidos, reduzindo atritos do processamento síncrono da IA, e utilizando o Redis local no N8N para escalonamento de alto volume.

### 2.4 O Paradigma "Database-First" com Service Layer

- **O Banco é o Backend:** Toda validação de permissão crítica, cálculos de billing e integridade de dados ocorre em **PL/pgSQL**. O `PostgREST` expõe o schema de forma segura.
- **Service Layer no Frontend (Modularizada `src/services/`):** 
  - Anteriormente centralizada em um "God Object" de mais de 2.000 linhas (`api.ts`), a camada foi refatorada e dividida por domínios (`auth.service.ts`, `agents.service.ts`, `financial.service.ts`, `conversations.service.ts`, etc).
  - O antigo arquivo `api.ts` atua agora apenas como uma **Facade** (Fachada) injetando o supabase e agregando os submódulos, garantindo compatibilidade com o resto do sistema (Zero quebras de UI ou dependências circulares). Traduz `snake_case` (DB) para `camelCase` (frontend).
- **Contexto Global (`src/contexts/AppContext.tsx`):** React Context utilizando `AppProvider` para gerenciar estado global: usuário autenticado, tenant ativo, lista de conversas e painel lateral (slide-over). Faz polling de conversas a cada 20s e mensagens a cada 5s.
- **Segurança Nativa por RLS:** Isolamento multi-tenant garantido pelo PostgreSQL. Impossível que um tenant acesse dados de outro, mesmo em caso de erro no frontend.

---

## 3. Rotas da Aplicação (Frontend SPA)

Roteamento gerenciado por `react-router-dom` v6. Todas as rotas protegidas requerem autenticação via `ProtectedRoute`.

### 3.1 Rotas Públicas

| Rota | Componente | Descrição |
| :--- | :--- | :--- |
| `/login` | `Login.tsx` | Autenticação via email/senha (Supabase Auth). Dark, high-tech aesthetic. |
| `/forgot-password` | `ForgotPassword.tsx` | Fluxo de recuperação de senha. |
| `/pending-approval` | `PendingApproval.tsx` | Tela exibida para usuários com `status = 'pending'`. |

### 3.2 Rotas Protegidas (Requerem Autenticação)

| Rota | Componente | Acesso | Descrição |
| :--- | :--- | :--- | :--- |
| `/select-tenant` | `SelectTenant.tsx` | Super Admin | Seletor de empresa para Super Admins impersonarem tenants. |
| `/` | `Index.tsx` (Dashboard) | Todos | Dashboard principal com visão operacional tática. |
| `/lead-crm` | `LeadCRM.tsx` | Tenant Admin+ | Visualização Kanban de leads por estágio do funil. |
| `/conversations` | `Conversations.tsx` | Operator+ | Inbox de conversas com chat em tempo real. |
| `/agents` | `Agents.tsx` | Tenant Admin+ | Gestão completa de agentes (CRUD + RAG + Governança). |
| `/flows` | `Flows.tsx` | Tenant Admin+ | Editor de fluxos conversacionais com etapas. |
| `/campaigns` | `Campaigns.tsx` | Tenant Admin+ | Gerenciamento de campanhas de outbound proativo. |
| `/contacts` | `Contacts.tsx` | Tenant Admin+ | CRM de contatos com filtro e busca. |
| `/consumption` | `Consumption.tsx` | Tenant Admin+ | Análise detalhada de consumo de tokens, mensagens, STT/TTS. |
| `/quality` | `Quality.tsx` | Tenant Admin+ | Módulo de QA — lista de avaliações de conversas com score. |
| `/governance` | `Governance.tsx` | Tenant Admin+ | Painel de governança: políticas, incidentes, logs de decisão. |
| `/decision-logs` | `DecisionLogs.tsx` | Compliance+ | Logs de decisão da IA com rastreabilidade. |
| `/alerts` | `Alerts.tsx` | Todos | Alertas de billing e operacionais. |
| `/settings` | `Settings.tsx` | Tenant Admin+ | Configurações: privacidade (LGPD), VAPI, limites. |
| `/users` | `Users.tsx` | Tenant Admin+ | Gestão de usuários (aprovar, bloquear, convidar). |
| `/profiles` | `Profiles.tsx` | Tenant Admin+ | Gerenciar perfis de acesso (RBAC). |
| `/companies` | `Companies.tsx` | Super Admin | Gerenciar tenants (empresas). Vista global. |
| `/plans` | `Plans.tsx` | Super Admin | Catálogo de planos SaaS (CRUD + audit log). |
| `/financials` | `FinancialSummary.tsx` | Super Admin | DRE financeiro por tenant (receita, custo, margem). |

---

## 4. Auth V2 & RBAC (Database-Agnostic)

### 4.1 Tabelas de Identidade

**`auth.users` (Supabase):** Gerencia credenciais, tokens e sessões JWT.
**`public.users` (Nexus):** Gerencia o negócio — papéis, status, vínculo com tenant.

```sql
-- Campos-chave de public.users
id UUID PRIMARY KEY                -- UUID próprio
tenant_id UUID REFERENCES companies -- Nullable para Super Admins
email VARCHAR(255) UNIQUE
full_name VARCHAR(255)
role VARCHAR(50)                   -- 'super_admin' | 'tenant_admin' | 'operator' | 'viewer'
status VARCHAR(20)                 -- 'pending' | 'active' | 'blocked' | 'invited'
provider_id VARCHAR                -- Elo com auth.users (auth.uid())
is_active BOOLEAN
last_login_at TIMESTAMPTZ
```

### 4.2 Fluxo de Login Híbrido (`AuthService` + `AppContext`)

```
1. Usuário faz login via Supabase Auth (email/senha).
2. AppContext.boot() intercepta a sessão: getSession() retorna {user}.
3. AuthService.getUserByProviderId(auth.uid()) busca em public.users.
4. [Auto-Link] Se não encontrado, tenta vincular por email (invite/legacy).

Validação de Status:
├─ status = 'pending'  → Redireciona para /pending-approval
├─ status = 'blocked'  → Força signOut() imediato
└─ status = 'active'   → Carrega tenant (via localStorage) e libera acesso

5. Super Admin: redireciona para /select-tenant se não tiver tenant salvo.
6. Tenant salvo em localStorage['davos_active_tenant_id'] para persistência.
```

### 4.3 RBAC — Permissões Granulares

O sistema define ~21 permissões em `src/lib/types.ts`:

| Categoria | Permissões |
| :--- | :--- |
| **Conversas** | `conversations.view`, `.operate`, `.takeover`, `.transfer`, `.ai_toggle` |
| **Agentes** | `agents.view`, `.edit`, `.create` |
| **Fluxos** | `flows.view`, `.manage` |
| **Consumo** | `consumption.view`, `.financial`, `.export` |
| **Usuários** | `users.view`, `.manage` |
| **Governança** | `governance.view`, `.manage`, `.incidents` |
| **Administração** | `profiles.manage`, `settings.manage` |
| **Plataforma** | `platform.companies`, `platform.global_settings` (Super Admin only) |

**Papéis do Sistema (DEFAULT_ROLES):**
- `super_admin`: Todas as permissões + acesso mult-tenant.
- `tenant_admin`: Todas exceto `platform.*`.
- `operator`: Subset focado em conversas e visualização.
- `viewer`: Somente leitura (view permissions).

### 4.4 Fluxo de Aprovação (Admin UI)

```
Novo Cadastro → status = 'pending'
      ↓
Super Admin vê lista em /users (aba "Pendentes")
      ↓
Aprovar: define tenant_id + role → status = 'active'
Rejeitar: status = 'blocked'
```

---

## 5. Schema do Banco de Dados (Fonte da Verdade)

Arquivo de referência: `database/complete_schema.sql` (751 linhas)

### 5.1 ENUMs Definidos

```sql
tenant_status:      'active' | 'suspended' | 'trial'
plan_type:          'fixed' | 'flex' | 'unlimited' | 'enterprise'
agent_status:       'active' | 'inactive'
risk_level:         'low' | 'medium' | 'high' | 'critical'
lifecycle_stage:    'development' | 'validation' | 'production' | 'monitoring' | 'retired'
conversation_channel: 'text' | 'voice' | 'whatsapp'
conversation_status:  'ai_active' | 'human_active' | 'closed'
flow_direction:     'inbound' | 'outbound'
flow_actor:         'ai' | 'human' | 'both'
metric_type:        'tokens' | 'messages' | 'stt_minutes' | 'tts_minutes'
incident_severity:  'low' | 'medium' | 'high' | 'critical'
incident_status:    'open' | 'investigating' | 'resolved'
campaign_status:    'draft' | 'active' | 'paused' | 'completed' | 'cancelled'
```

### 5.2 Diagrama de Tabelas

```
companies (tenants)
    ├── plans (catálogo, FK por plan_tier)
    ├── company_davos_costs (custos internos Davos)
    ├── billing_alerts
    ├── users
    ├── agents
    │   ├── agent_knowledge (RAG por agente)
    │   ├── agent_audit_logs (imutável)
    │   ├── agent_flows (N:N pivot)
    │   └── agent_success_memory (RAG de reforço positivo)
    ├── policies
    ├── incidents
    ├── flows
    │   └── flow_stages
    ├── contacts (CRM)
    ├── conversations
    │   ├── messages
    │   ├── evaluations (QA/Auditoria)
    │   └── conversation_artifacts (mídia: áudio, imagem, vídeo)
    ├── consumption_metrics (billing)
    ├── campaigns
    │   └── outbound_queue
    ├── audit_logs (imutável)
    ├── integration_logs (webhooks brutos, não-repúdio)
    └── chat_histories_memory (LangChain, session_id based)
```

### 5.3 Tabelas Principais — Detalhamento

#### `companies` (Raiz dos Tenants)
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | UUID PK | Identificador único |
| `name` | VARCHAR(255) | Nome da empresa |
| `slug` | VARCHAR(255) UNIQUE | Namespace funcional (ex: "hotel-davos") |
| `status` | tenant_status | `active` / `suspended` / `trial` |
| `plan_tier` | plan_type | FK para `plans.id` (texto) |
| `api_key` | VARCHAR(1024) | Chave para acesso externo (n8n Bearer Auth) |
| `plan_details` | JSONB | Limites e preços customizados |
| `privacy_settings` | JSONB | `{anonymization: bool, retention_days: int}` |
| `ai_system_owner_id` | UUID | Responsável pelo sistema de IA (ISO 42001) |
| `risk_owner_id` | UUID | Responsável por riscos |
| `compliance_officer_id` | UUID | Oficial de compliance |

#### `agents` (Core Funcional)
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | UUID PK | |
| `tenant_id` | UUID NOT NULL | FK → companies |
| `name` | VARCHAR(255) | Nome exibido |
| `status` | agent_status | `active` / `inactive` |
| `type` | VARCHAR(50) | `'embedded'` / `'whatsapp'` / `'conversational'` |
| `channels` | TEXT[] | Array: `['text','voice']` |
| `risk_level` | risk_level | Nível de risco da IA |
| `lifecycle_stage` | lifecycle_stage | Estágio de ciclo de vida |
| `autonomy_level` | INT(1–5) | Grau de autonomia da IA |
| `max_concurrency` | INT | Conversas simultâneas máximas |
| `context_window` | INT | Quantidade de mensagens no contexto enviado ao LLM |
| `session_timeout_seconds` | INT | Timeout para encerramento automático |
| `brain_config` | JSONB | `{systemPrompt, modelId, temperature, maxTokens, userPromptTemplate, budget_share_pct}` |
| `voice_config` | JSONB | `{provider, vapiAgentId, voiceId, ambientSound}` |
| `integration_config` | JSONB | `{n8n_webhook_url, response_mode}` |
| `evolution_instance` | VARCHAR | Nome da instância na Evolution API |
| `evolution_token` | VARCHAR | Token da instância |
| `applied_policies` | TEXT[] | IDs/nomes de políticas vinculadas |
| `risk_score` | NUMERIC | Score acumulado de risco (ISO 42001) |
| `last_actor_name` | TEXT | Último usuário que alterou o agente (auditoria UI) |

#### `conversations`
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | UUID PK | |
| `tenant_id` | UUID NOT NULL | |
| `agent_id` | UUID | FK → agents |
| `user_identifier` | VARCHAR(255) | Telefone (WhatsApp) ou UserID |
| `user_name` | VARCHAR(255) | Nome exibido |
| `channel` | conversation_channel | `text` / `voice` / `whatsapp` |
| `status` | conversation_status | `ai_active` / `human_active` / `closed` |
| `assigned_operator_id` | UUID | FK → users (operador atual) |
| `current_flow_id` | UUID | FK → flows (fluxo ativo) |
| `current_stage_id` | UUID | FK → flow_stages (etapa atual) |
| `last_message_at` | TIMESTAMPTZ | Usado para gestão de inatividade |
| `is_simulation` | BOOLEAN | Flag para Playground/Demo |

#### `messages`
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `content` | TEXT | Conteúdo textual |
| `message_type` | VARCHAR(20) | `'text'` / `'audio'` / `'image'` |
| `sender_type` | VARCHAR(20) | `'user'` / `'ai'` / `'human'` |
| `audio_url` | VARCHAR(1024) | URL do áudio |
| `transcription` | TEXT | Transcrição do áudio (STT) |
| `image_url` | VARCHAR(1024) | URL da imagem |
| `external_id` | VARCHAR(255) | ID externo (VAPI call ID) |
| `external_order` | INT | Ordem dentro da chamada (idempotência VAPI) |
| `metadata` | JSONB | Dados extras do provider |
| UNIQUE | `(tenant_id, external_id)` | Prevenção de duplicatas VAPI |

#### `evaluations` (QA/Auditoria)
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `score` | INT(0–100) | Nota da auditoria IA |
| `summary` | TEXT | Resumo textual da avaliação |
| `tags` | TEXT[] | Tags automáticas (ex: `['positivo','resolução']`) |
| `criteria_results` | JSONB | `{empathy, efficiency, compliance}` com notas |
| `ai_model` | VARCHAR(50) | Modelo usado na avaliação |

#### `campaigns` (Outbound Proativo)
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `status` | campaign_status | `draft` / `active` / `paused` / `completed` / `cancelled` |
| `start_date` / `end_date` | DATE | Janela de execução |
| `start_time` / `end_time` | TEXT | Horário diário (ex: `"09:00"` / `"18:00"`) |
| `daily_limit` | INTEGER | Máximo de disparos por dia |
| `total_contacts` | INTEGER | Total na lista |
| `sent_count` | INTEGER | Enviados com sucesso |
| `response_count` | INTEGER | Respostas recebidas (conversões) |
| `initial_message` | TEXT | Mensagem inicial da campanha |

#### `outbound_queue` (Fila da Campanha)
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `campaign_id` | UUID | FK → campaigns |
| `contact_phone` | VARCHAR(50) | Telefone do destinatário |
| `status` | VARCHAR(20) | `pending` / `sent` / `failed` |
| `response_detected` | BOOLEAN | Se o contato respondeu (conversão) |
| `retry_count` | INTEGER | Tentativas de reenvio |
| `last_attempt_at` | TIMESTAMPTZ | Timestamp da última tentativa |
| UNIQUE | `(campaign_id, contact_phone)` | Deduplicação automática |

#### `conversation_artifacts` (Mídia de Conversas)
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `platform` | VARCHAR(50) | `'vapi'` / `'whatsapp'` / `'internal'` |
| `file_type` | VARCHAR(50) | `'audio'` / `'image'` / `'video'` |
| `storage_path` | VARCHAR(255) | Path no Supabase Storage |
| `external_url` | TEXT | URL pública externa |
| `metadata` | JSONB | Metadados do arquivo |

#### `plans` (Catálogo SaaS)
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | TEXT PK | Identificador legível (ex: `"pro-2026"`) |
| `type` | TEXT | `'fixed'` / `'flex'` / `'unlimited'` / `'enterprise'` |
| `base_price` | NUMERIC | Mensalidade base (BRL) |
| `llm_token_price` | NUMERIC | Preço por 1k tokens |
| `message_price` | NUMERIC | Preço por mensagem |
| `stt_minute_price` | NUMERIC | Preço por minuto STT (Entrada) |
| `tts_minute_price` | NUMERIC | Preço por minuto TTS (Saída) |
| `default_limits` | JSONB | `{llmTokens, messages, sttMinutes, ttsMinutes, agents, users}` |
| `monthly_fee_covers_usage` | BOOLEAN | Se a mensalidade já cobre o consumo |

> **Nota de Arquitetura (V2):** O preço de "Voz" foi segmentado em STT e TTS para permitir margens mais precisas por motor, mas para fins de **custo fixo por minuto de chamada**, o sistema utiliza a soma de ambos na venda e o maior valor entre eles no custo interno da Davos.

#### `conversation_security_sessions` (Transactional Identity Gate)
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `conversation_id` | UUID | FK → conversations (UNIQUE com agent_id para status='active') |
| `agent_id` | UUID | FK → agents |
| `status` | VARCHAR | `'unauthenticated'` / `'active'` / `'locked'` / `'expired'` |
| `validated_identifier` | VARCHAR(255) | Ex: CNPJ ou CPF autenticado com sucesso |
| `failed_attempts` | INTEGER | Proteção contra Brute Force |
| `locked_until` | TIMESTAMPTZ | Tempo de penalidade caso estoure tentativas |
| `expires_at` | TIMESTAMPTZ | Timeout da sessão (avaliado lazy) |

---

## 6. RPCs (Remote Procedure Calls) — Contrato com o Frontend

Todas as RPCs são funções `SECURITY DEFINER` em PL/pgSQL, chamadas via `supabase.rpc()`.

### 6.1 RPCs de Dashboard & Performance

| RPC | Parâmetros | Retorno | Uso |
| :--- | :--- | :--- | :--- |
| `get_dashboard_summary` | `p_tenant_id` | `{agents[], tenant{company, plan}}` | Dashboard principal + lista de agentes com uso. |
| `get_companies_overview` | — | `{id, name, agents_count, ...}[]` | Visão de todas as empresas (Super Admin). Inclui contadores e preços. |
| `get_agent_usage_stats` | `p_tenant_id` | `{agent_id, total_tokens, total_cost, ...}[]` | Consumo por agente. CTE com FULL OUTER JOIN para evitar perda de dados. |
| `get_tenant_usage_summary` | `p_tenant_id, p_month, p_year` | `{total_tokens, stt_minutes, ...}` | Resumo de uso do mês para dashboard. |
| `get_detailed_consumption` | `p_tenant_id, p_days` | `{id, agent_name, metric_type, value, cost}[]` | Lista bruta de eventos de consumo para a página `/consumption`. |
| `get_financial_report` | `p_month, p_year` | `FinancialReportRecord[]` | DRE por tenant (receita, custo, margem). Visão Super Admin. |

### 6.2 RPCs de Orquestração N8N

| RPC | Versão Atual | Papel |
| :--- | :--- | :--- |
| `n8n_orchestrator_v5` | **V5 (master atual)** | Versão consolidada que substitui a V4. Além de tudo que V4 fazia, adiciona: suporte a Meta API Token, hierarquia de sub-agentes, recuperação de `session_status` e `session_identifier` da tabela `conversation_security_sessions` (com verificação de `expires_at > NOW()` e expiração automática de sessões vencidas via UPDATE proativo). |
| `n8n_orchestrator_v4` | V4 (legacy) | Versão anterior, mantida como fallback. Em processo de depreciação. |
| `record_message` | Atual | Gravação segura de mensagens. Bypassa RLS (service_role). Suporta multimídia. Atualiza `last_message_at`. |
| `record_usage` | Atual | Registra evento de consumo. Detecta canal pelo tipo do agente. |
| `sync_vapi_call` | V27 | Idempotente. Sincroniza chamada de voz VAPI: grava payload em `integration_logs`, sincroniza mensagens com chave `(conversation_id, external_id)`, calcula custo por duração. |
| `get_agent_context` | Atual | Retorna chunks de knowledge relevantes via similarity search (pgvector). |
| `handle_outbound_sent` | Atual | Atomicamente marca envio como sucesso na `outbound_queue`. |

### 6.3 RPCs de Qualidade & Auditoria

| RPC | Papel |
| :--- | :--- |
| `get_conversation_transcript` | Retorna transcrição formatada de conversa para o N8N auditar. |
| `save_evaluation` | Salva resultado de auditoria. Se `score < 40`, abre incidente automaticamente. |
| `get_unaudited_conversations` | Lista conversas fechadas sem avaliação (fila de auditoria). |
| `get_pending_audits` | Versão paginada para worker N8N processar sequencialmente. |
| `close_idle_conversations` | Encerra conversas inativas (timeout) e dispara auditoria. |
| `delete_company_cascade` | Deleta empresa e todos os dados relacionados em cascata. |

### 6.4 RPCs de Segurança (Identity Gate)

| RPC | Parâmetros | Papel |
| :--- | :--- | :--- |
| `evaluate_conversation_security` | `uuid, uuid, text` | O "Guarda": avalia a sessão ativa garantida por `UNIQUE(conversation_id, agent_id)` e permite/bloqueia intent. |
| `mock_validate_identity` | `text, text, text` | O "Validador": autentica o documento e abre a sessão segura da conversa. |
| `financial_get_customer_summary_safe` | `text, text, text` | Ferramenta Segura: intercepta o CPF do payload N8N mitigando Prompt Injection e lendo apenas o CPF do cofre (Gatekeeper). |

---

## 7. Auth & Governança de Dados (Segurança em Camadas)

### 7.1 Otimização de RLS V7 (Statement Caching)

Para evitar latências >2s em tabelas grandes, todas as políticas RLS usam o padrão de **sub-select com cache**:

```sql
-- ✅ CORRETO (avaliado uma vez por statement):
USING ( tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()) )

-- ❌ ERRADO (avaliado uma vez por linha — N+1 fatal):
USING ( tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()) )
```

### 7.2 Funções de Contexto (Helpers de RLS)

```sql
get_auth_tenant_id()  -- Retorna o tenant_id do auth.uid() atual
is_super_admin()      -- Retorna TRUE se role = 'super_admin'
```

### 7.3 Índices de Performance

| Índice | Tabela | Colunas | Propósito |
| :--- | :--- | :--- | :--- |
| `idx_companies_slug` | companies | `(slug)` | Lookup rápido por namespace |
| `idx_users_tenant` | users | `(tenant_id)` | RLS e filtros por empresa |
| `idx_agents_tenant` | agents | `(tenant_id)` | RLS e listagens |
| `idx_conversations_tenant` | conversations | `(tenant_id)` | Inbox e relatórios |
| `idx_conversations_agent` | conversations | `(agent_id)` | Métricas por agente |
| `idx_messages_conversation` | messages | `(conversation_id)` | Carregamento do chat |
| `idx_consumption_tenant_date` | consumption_metrics | `(tenant_id, recorded_at)` | Consultas financeiras temporais |
| `idx_evaluations_score` | evaluations | `(score)` | Filtro de qualidade |
| `idx_outbound_queue_status_retry` | outbound_queue | `(status, retry_count) WHERE status='pending'` | Filtro eficiente da fila |
| `idx_conv_artifacts_conv` | conversation_artifacts | `(conversation_id)` | Recuperação de mídia |

---

## 8. Ciclo de Vida da Conversa & Integração de Voz

### 8.1 Máquina de Estados (FSM)

```
ai_active ──── intent/erro ────► human_active ──── /assumir ────► ai_active
    │                                                                   │
    └──────── close() ─────────────────► closed ◄─────────────── close()
                                             │
                                      [Trigger Auditoria]
```

**Transições e Efeitos:**
- **AI_ACTIVE → HUMAN_ACTIVE:** `assigned_operator_id` é preenchido. N8N para de processar. Chat muda de cor no UI. Input de texto do operador ativado.
- **HUMAN_ACTIVE → AI_ACTIVE:** `assigned_operator_id = NULL`. N8N retoma processamento.
- **→ CLOSED:** `api.closeConversation()` + `api.triggerAudit()` são chamados automaticamente pelo `AppContext.closeConversation()`.

### 8.2 Integração VAPI (Idempotência)

A integração de voz é assíncrona e idempotente:

```
1. VAPI envia webhook POST ao fim da chamada
2. Edge Function recebe + chama RPC sync_vapi_call
3. RPC:
   ├─ Grava payload bruto em integration_logs (não-repúdio)
   ├─ Usa UNIQUE(tenant_id, external_id) para deduplicação
   ├─ Calcula custo por duração (startedAt - endedAt)
   └─ Sincroniza mensagens na tabela messages via external_order
```

### 8.3 Gestão de Inatividade (Session Timeout)

- Cada agente tem `session_timeout_seconds` configurável.
- A RPC `close_idle_conversations` verifica `last_message_at + timeout < NOW()`.
- Conversas inativas são encerradas automaticamente e entram na fila de auditoria.

---

## 9. Inteligência de Conhecimento (RAG)

### 9.1 Knowledge Base Estática (RAG por Agente)

**Processamento 100% Client-Side** para reduzir carga no backend:

| Etapa | Tecnologia | Detalhe |
| :--- | :--- | :--- |
| **Extração** | `pdfjs-dist` + WebWorkers | PDF → texto. Suporte a `.docx` (mammoth), `.xlsx`, `.csv`, `.json` |
| **Chunking** | `src/lib/text-chunker.ts` | Divide documentos em fragmentos otimizados para tokens |
| **Embeddings** | OpenAI `text-embedding-3-small` | Chamadas diretas do frontend via `api.generateEmbedding()` |
| **Persistência** | `agent_knowledge` table | Armazena chunk + embedding. UI agrupa chunks do mesmo arquivo |
| **Recuperação** | `get_agent_context` RPC | Cosine Similarity via `pgvector`. Retorna top-K chunks relevantes |

A UI exibe arquivos agrupados (ex: `Apostila.pdf (Parte 1/5)`) mas armazena cada chunk individualmente no banco.

### 9.2 RAG de Reforço Positivo ("Success Memory")

Sistema de **aprendizado contínuo** baseado em feedback de conversas auditadas:

```
Batch Job Diário (N8N):
1. Busca conversas com score >= 75 dos últimos 7 dias
2. Usa LLM para extrair "o que funcionou" (estratégia)
3. Sanitiza PII (remove nomes/telefones)
4. Gera embeddings e salva em agent_success_memory

Recuperação (em tempo real):
1. Embedding da pergunta atual do usuário
2. match_success_memory_as_system → busca estratégias similares
3. Injeta no System Prompt: "Em situações similares, funcionou: X, Y, Z"
```

Resultado: O agente "imita" seus melhores momentos — flywheel de qualidade.

---

## 10. Governança de Agentes (ISO 42001)

Um **Agente** é um Ativo Corporativo sujeito a auditoria. O Nexus implementa as dimensões de controle definidas pela ISO 42001 e NIST AI RMF.

### 10.1 Dimensões de Controle por Agente

| Campo | Valores | Impacto Funcional |
| :--- | :--- | :--- |
| `risk_level` | `low` / `medium` / `high` / `critical` | Agentes `high` ou `critical` exigem aprovação/transação segura. Mudança para `high` ativa o **Identity Gate** automaticamente no Frontend. |
| `lifecycle_stage` | `development` → `validation` → `production` → `monitoring` → `retired` | Apenas `production` e `monitoring` são exibidos no cálculo de custo de plano. |
| `autonomy_level` | 1–5 | Define limite de ação autônoma. Nível 5 exige HITL. |
| `context_window` | Inteiro | Qtd. de mensagens no contexto enviado ao LLM via N8N. |
| `applied_policies` | TEXT[] | Políticas de comportamento vinculadas. |

### 10.2 Audit Trail de Agentes

O trigger `trg_audit_agents` grava automaticamente todas as alterações em `agent_audit_logs`:
- **Ação:** `INSERT` / `UPDATE` / `DELETE`
- **Estados:** `old_state` e `new_state` em JSONB
- **Ator:** `auth.uid()` (quem alterou)

A UI exibe esse histórico no painel `AgentHistoryPanel.tsx`.

### 10.3 Gerenciamento de Incidentes

Incidentes podem ser criados manualmente (na tela `/governance`) ou **automaticamente pelo sistema** quando `save_evaluation` recebe `score < 40`.

**Fluxo de Resolução:**
1. Incidente em `status = 'open'`
2. Investigação: `status = 'investigating'` + notas de ação
3. Resolução: `status = 'resolved'` + `action_taken` + `resolved_at` + `resolved_by`
4. Upload de evidências via Supabase Storage (`incident-attachments` bucket)

### 10.4 Políticas de IA (Regras de Comportamento)

```typescript
interface AIPolicy {
  rules: {
    canDo: string[];         // Ações permitidas
    cannotDo: string[];      // Restrições explícitas
    transferConditions: string[]; // Gatilhos de handoff
  }
}
```

A UI gera sugestões de regras usando GPT-4o-mini via `api.generatePolicySuggestions()`.

### 10.5 Sistema de Score de Risco Acumulado (ISO 42001)

O Nexus agora utiliza uma matriz de risco dinâmica que avalia incidentes em tempo real durante a conversa. O bloqueio de funções críticas ("Identity Gate") não é mais binário, mas baseado em peso acumulado:

| Severidade do Incidente | Peso (Score) | Ação Recomendada |
| :--- | :--- | :--- |
| **Critical** | 3.0 | Bloqueio imediato da sessão segura. |
| **High** | 1.0 | Alerta de compliance e restrição de ferramentas financeiras. |
| **Medium** | 0.3 | Log de auditoria e monitoramento intensivo. |
| **Low** | 0.0 | Registro informativo apenas. |

A RPC `evaluate_conversation_security` soma os pesos dos incidentes ativos na conversa. Se o score ultrapassar o limite configurado (padrão: 1.0), as ferramentas protegidas são desativadas preventivamente.

---

## 11. Módulo de Qualidade (QA & Auditoria)

### 11.1 Fila Automática de Auditoria

Conversas `closed` sem avaliação entram automaticamente na fila via RPC `get_pending_audits`. Um worker N8N processa essa fila sequencialmente (loop com wait de 5s) para garantir **100% de cobertura de auditoria** conforme ISO 42001.

### 11.2 Re-auditoria Manual

O botão de re-auditoria no painel `EvaluationDetailsPanel.tsx` chama `api.triggerAudit()`, que envia `POST {type: 'MANUAL'}` ao webhook N8N (`/audit-conversation`).

### 11.3 Critérios de Avaliação

O N8N retorna scores em 3 dimensões, salvas em `criteria_results`:
- **Empatia:** Linguagem humanizada e empática.
- **Eficiência:** Resolução rápida e direta.
- **Compliance:** Aderência às políticas da empresa.

**Score consolidado (0–100):**
- `>= 80` → Lead Quente 🔥. Tags automáticas. Entra no Success Memory.
- `>= 40 && < 80` → Neutro.
- `< 40` → Incidente aberto automaticamente.

---

## 12. Consumo Financeiro & Billing

### 12.1 Modalidades de Plano

| Tipo | Lógica | Uso |
| :--- | :--- | :--- |
| **Fixed (Quota)** | Mensalidade fixa + hard limit. Excedente bloqueia. | PMEs e planos de entrada. |
| **Flex (Pay-as-you-go)** | Mensalidade base + custo por excedente. Mensalidade pode ser crédito. | Enterprise, alto volume. |
| **Unlimited** | Valor fixo alto, Fair Use policy. | Grandes contas / contratos governamentais. |
| **Enterprise** | Configuração custom total. | Casos especiais. |

### 12.2 Quatro Métricas de Consumo

| Métrica | Unidade | Tabela/Tipo |
| :--- | :--- | :--- |
| Tokens LLM | Tokens (input + output) | `metric_type = 'tokens'` |
| Mensagens | Unidades | `metric_type = 'messages'` |
| STT (Speech-to-Text) | Minutos | `metric_type = 'stt_minutes'` |
| TTS (Text-to-Speech) | Minutos | `metric_type = 'tts_minutes'` |

### 12.3 Fluxo de Billing

```
1. N8N chama record_usage após cada interação
        ↓
2. consumption_metrics acumula eventos
        ↓
3. get_detailed_consumption (RPC) agrega por agente/canal
        ↓
4. Frontend recalcula custo = (valor × preço_do_plano) em tempo real
        ↓
5. Predictor de fatura = (custo_atual / dias_do_mês) × 30
```

> **Nota:** O frontend sempre recalcula o custo usando os preços do plano (não o `cost` bruto do banco) para garantir sincronismo com a tabela `plans`. Isso é feito em `api.getDashboardSummary()` para agentes em `production`/`monitoring`.

### 12.4 Cálculo de ROI

```
Horas Humanas Economizadas = (Total Mensagens × 2.0 min/msg) / 60
```

O fator de 2.0 min/msg é fixo e alinhado entre Dashboard e tela de Consumo.

### 12.5 DRE — Dashboard Financeiro (`/financials`)

Visão executiva exclusiva do Super Admin via RPC `get_financial_report`:
- **Receita Bruta** = Mensalidades Fixas + Excedente Cobrado
- **Custos Operacionais** = Custo de Infra (Supabase/Vercel) + APIs (OpenAI/VAPI)
- **Margem Líquida** = `Receita - Custos`
- **Alerta automático** quando margem < 20%

Os custos internos da Davos são editáveis via `company_davos_costs` (tabela CRUD no `/financials`).

### 12.6 Lógica Anti-Duplicidade de Custos (Voz)

Para evitar inflar o custo operacional (DRE), a RPC `get_financial_report` utiliza a métrica `GREATEST(val_stt, val_tts)` para calcular o custo variável de minutos de voz. Isso garante que, embora o banco grave dois registros (um por motor), a cobrança de custo interno da Davos reflita apenas a minutagem real da chamada telefônica.

---

## 13. Inteligência de Leads & Campanhas (CRM V2)

### 13.1 CRM de Contatos (`/contacts`)

- CRUD completo de contatos com `identifier` único (telefone/email).
- Busca em tempo real por nome, identifier ou email.
- Tags livres, canal de origem, `lifecycle_status` para segmentação.
- Painel lateral `ContactDetailsPanel.tsx` com histórico de conversas e tags.

### 13.2 Kanban de Leads (`/lead-crm`)

```
Lead (frio) → MQL (médio) → SQL (quente 🔥) → Customer
```
Movimentação automática pela IA (baseada em score da auditoria) ou manual pelo operador. Baseado em `contacts.lifecycle_status`.

### 13.3 Campanhas de Outbound (`/campaigns`)

**Fluxo completo:**
```
1. Criar campanha (nome, agente, datas, limite diário, mensagem inicial)
2. Importar lista: .csv/.xls/.xlsx com detecção automática de colunas
3. Deduplicação automática por (campaign_id, contact_phone) via UNIQUE
4. Status: draft → active → running → completed/cancelled
5. N8N consome outbound_queue (status='pending') em janela horária
6. handle_outbound_sent() → marca como 'sent' + atualiza sent_count
7. trg_track_campaign_response → detecta resposta inbound → response_detected=true
8. Dashboard exibe: enviados, falhas, taxa de resposta
```

---

## 14. Módulo de Fluxos Conversacionais (`/flows`)

Fluxos são **roteiros estruturados** que orientam o comportamento da IA em diferentes contextos.

### 14.1 Estrutura de um Fluxo

```typescript
interface ConversationalFlow {
  direction: 'inbound' | 'outbound';
  objective: string;           // Meta do fluxo
  success_criteria: string;    // Quando é considerado sucesso
  stages: FlowStage[];         // Etapas ordenadas
}

interface FlowStage {
  type: 'greeting' | 'qualification' | 'resolution' | 'handoff' | 'closing';
  actor: 'ai' | 'human' | 'both';
  escalation_rule?: string;    // Chave que o N8N interpreta
}
```

### 14.2 Vinculação com Agentes

A tabela pivot `agent_flows(agent_id, flow_id, is_primary)` vincula agentes a múltiplos fluxos. O fluxo "primário" é o padrão de atendimento do agente.

---

## 15. Privacidade & LGPD (Privacy by Design)

### 15.1 Camada de Mascaramento UI (`src/lib/masking.ts`)

Padrões de regex para mascarar automaticamente no frontend antes da renderização:

| Dado | Padrão de Regex | Formato Mascarado |
| :--- | :--- | :--- |
| CPF | `\d{3}\.\d{3}\.\d{3}-\d{2}` | `***.***.123-**` |
| CNPJ | `\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}` | `**.***.***/****-**` |
| Email | `[\w.-]+@[\w.-]+` | `u***@d***.com` |
| Telefone | `(\+55)?\d{10,11}` | `(**) ****-5678` |
| Cartão de Crédito | `\d{4} \d{4} \d{4} \d{4}` | `**** **** **** 1234` |

**Controle:** O toggle `maskingEnabled` em `AppContext` (padrão: `true`) permite que operadores autorizados revelem dados temporariamente. O dado no banco permanece íntegro.

### 15.2 Configuração por Tenant

A tabela `companies.privacy_settings` armazena:
```json
{
  "anonymization": false,
  "retention_days": 365,
  "lgpd_masking_enabled": true,
  "ai_disclosure_message": "Você está sendo atendido por uma IA..."
}
```

---

## 16. Monitoramento & Observabilidade

### 16.1 Polling de Conversas (AppContext)

| Intervalo | Dado | Motivo |
| :--- | :--- | :--- |
| 20 segundos | Lista de conversas | Atualizar status geral sem sobrecarregar |
| 5 segundos | Mensagens da conversa ativa | Alta frequência para operador em atendimento |

Estratégia de merge: compara `lastMessageTime` e `status` para decidir se realmente precisa re-renderizar.

### 16.2 Monitor de Latência (`/admin/system-status`)

**Ping Híbrido em duas direções:**

1. **Frontend Pings (Perspectiva do Usuário):**
   - Navega do browser do operador → Vercel CDN e Supabase DB
   - Mede qualidade da conexão do operador

2. **Backend Pings (Edge Function `check-health`):**
   - Supabase US West como ponto central de medição
   - Dispara requisições HEAD/GET para: N8N (Utah), Evolution API (Utah), OpenAI/VAPI (USA)

**Indicadores de Saúde:**
- 🟢 **Saudável:** < 200ms (Acesso Intrarregião US)
- 🟡 **Degradado:** Latência 50% acima da média histórica
- 🔴 **Offline:** Timeout ou erro 5xx

---

## 18. Integração WhatsApp (Evolution API v2)

O módulo de WhatsApp foi redesenhado para suportar **provisionamento dinâmico** e evitar configurações manuais na Evolution API.

### 18.1 Provisionamento Automático de Instância

Ao criar uma conexão para um agente, o Nexus Hub envia um payload de configuração completa:
- **Auto-Webhook:** Configura a URL de destino (n8n/Backend) e marca como `enabled: true`.
- **Base64 Support:** Habilita `base64: true` para garantir que o sistema processe arquivos e mídias sem depender de storage externo da Evolution.
- **Event Filtering:** Ativa especificamente `MESSAGES_UPSERT` para otimizar o consumo de banda.
- **Unificação de UI:** A URL do Webhook Principal do agente foi movida para a aba de WhatsApp, tornando-se **obrigatória** para a criação de novas instâncias.

### 18.2 Fluxo de Conexão (Pairing)

1. **Identificação:** Se o nome da instância não existir ou for alterado, o sistema entra em modo "Create & Connect".
2. **Polling Ativo:** O frontend realiza polling recursivo a cada 3s após a geração do QR Code para detectar a transição `DISCONNECTED → CONNECTED` instantaneamente.
3. **Independência de Gateway:** O sistema suporta múltiplos números (instâncias) por tenant, cada um com seu próprio token e webhook, gerenciados centralmente na UI do agente.

---

## 19. Componentes da Interface (Arquitetura UI)

### 17.1 Estrutura de Diretórios do Frontend

```
src/
├─ App.tsx              # Router principal (20 rotas)
├─ main.tsx             # Entry point
├─ index.css            # Design tokens, dark mode, animações
├─ pages/               # 23 páginas
├─ components/
│   ├─ layout/          # Sidebar, Header, SlideOver container
│   ├─ panels/          # 18 painéis de detalhe (slide-over)
│   ├─ chat/            # ChatArea, MessageBubble
│   ├─ conversations/   # InboxFilter, ConversationCard
│   ├─ consumption/     # HeatmapChart, CostBreakdown
│   ├─ dashboard/       # StatCards, TrustScore
│   ├─ agents/          # AgentCard, KnowledgeUploader
│   ├─ auth/            # ProtectedRoute
│   ├─ admin/           # SystemStatus
│   ├─ settings/        # PrivacySettings
│   └─ ui/              # 50 componentes shadcn/ui (base)
├─ contexts/
│   └─ AppContext.tsx   # Auth, tenant, conversas, slide-over
├─ services/
│   ├─ api.ts           # Facade agregadora (God object fatiado)
│   ├─ auth.service.ts  # Autenticação (Login, Sessão)
│   ├─ agents.service.ts # Serviços de IA (RAG, Governance)
│   ├─ conversations.service.ts # Chat, Mensagens e Audits
│   ├─ financial.service.ts # DRE, Custos e Pricing
│   ├─ incidents.service.ts # Resolução ISO 42001
│   ├─ dashboard.service.ts # Analytics central 
│   └─ [...outros_modulos] # Users, Plans, Campaigns, etc.
├─ lib/
│   ├─ types.ts         # Tipos TypeScript (~865 linhas)
│   ├─ supabase.ts      # Singleton do cliente Supabase
│   ├─ masking.ts       # LGPD: mascaramento de PII
│   ├─ file-parsers.ts  # PDF, DOCX, XLSX → texto
│   ├─ text-chunker.ts  # Chunking semântico para RAG
│   ├─ agent-logic.ts   # Cálculos de risco e governança
│   ├─ consumption-logic.ts # Cálculos de custo e ROI
│   └─ utils.ts         # Helpers gerais (cn, formatters)
└─ hooks/               # React hooks customizados
```

### 17.2 Painéis de Detalhe (Slide-Over — 18 Painéis)

O sistema usa um único container `SlideOver` com 18 conteúdos dinamicamente injetados:

| Panel | Rota/Contexto | Descrição |
| :--- | :--- | :--- |
| `ConversationDetailsPanel` | `/conversations` | Histórico completo + avaliação + custo |
| `AgentConfigPanel` | `/agents` | Brain config, integrações, Knowledge Base |
| `AgentGovernancePanel` | `/agents` | Risco, políticas, ciclo de vida |
| `AgentHistoryPanel` | `/agents` | Auditoria de alterações do agente |
| `CompanyDetailsPanel` | `/companies` | Detalhes do tenant + limites |
| `IncidentDetailsPanel` | `/governance` | Resolver incidente + upload de evidência |
| `PolicyDetailsPanel` | `/governance` | Regras `canDo` / `cannotDo` |
| `FlowDetailsPanel` | `/flows` | Etapas do fluxo |
| `EvaluationDetailsPanel` | `/quality` | Score, critérios, re-auditoria |
| `ISOReportPanel` | `/governance` | Relatório ISO 42001 |
| `FinancialDetailPanel` | `/financials` | DRE detalhado por tenant |
| `PlanHistoryPanel` | `/plans` | Audit log do plano |
| `ConsumptionDetailsPanel` | `/consumption` | Breakdown de evento |
| `ContactDetailsPanel` | `/contacts` | Perfil + conversas + tags |
| `DecisionLogDetailsPanel` | `/decision-logs` | Raciocínio da decisão da IA |
| `PlaygroundPanel` | `/agents` | Simulação de conversa com agente |
| `UserProfilePanel` | `/users` | Perfil + paper de acesso |
| `UnauditedConversationsPanel` | `/quality` | Lista de conversas pendentes de auditoria |

---

## 18. Integração N8N (Contrato V5 — Master Orchestrator)

### 18.1 Fluxo Principal de Mensagem Inbound

```
WhatsApp/Voz → Evolution API → N8N Webhook
    → n8n_orchestrator_v5() (uma única transação SQL):
        ├─ Identifica agente pelo evolution_instance
        ├─ Valida status empresa (não 'suspended')
        ├─ Valida status agente (não 'inactive')
        ├─ Verifica concorrência (active_conversations < max_concurrency)
        ├─ Abre/Reabre conversa (Finite State Machine)
        ├─ Sincroniza contato (Unicidade por tenant_id + phone)
        ├─ Recupera session_status da conversation_security_sessions
        │   ├─ Expira automaticamente sessões com expires_at < NOW()
        │   └─ Retorna 'unauthenticated' se não há sessão ativa e válida
        ├─ Retorna sub-agentes vinculados ao agente
        └─ Retorna: {prompt, history, knowledge, contact_info, security:{session_status, session_identifier}, ...}
    → IF Security (verifica session_status === 'active')
        ├─ TRUE (autenticado): vai direto para Switch1 (performance — bypassa Gatekeeper)
        └─ FALSE (não autenticado): chama RPC Security Gatekeeper → avalia intent → allowToolExecution
    → Switch1 (roteia por should_use_tools do Formatar Contexto):
        ├─ TRUE: AI Agent com Tools (financeiro, boletos, acordos)
        └─ FALSE: AI Agent Sem Ferramentas (solicita autenticação CPF/CNPJ)
    → LLM Inference (OpenAI ou configurado no brain_config)
    → record_message() (salva resposta + atualiza last_message_at. Suporta p_message_type='image' e p_transcription)
    → record_usage() (registra tokens/mensagens consumidos)
```

### 18.2 Fluxo de Auditoria Automática (Workflow N8N)

```
Trigger: Webhook + Loop periódico
    → get_pending_audits() RPC
    → Para cada conversa sem auditoria:
        ├─ get_conversation_transcript()
        ├─ LLM: analisa e gera score/summary/criteria
        ├─ save_evaluation()
        │   └─ Se score < 40: cria incidente automaticamente
        └─ Wait 5s (throttle)
```

### 18.3 Fluxo de Mídia (Imagens e OCR — Inbound)

O sistema processa imagens enviadas pelo WhatsApp de forma autônoma:
1. **Trigger:** Webhook recebe `message_type = 'imageMessage'`.
2. **Mídia:** Chama Evolution API ("Obter mídia base64") para recuperar o binário via Base64.
3. **Extração:** Envia o binário para o node "Analyze Image" (OpenAI Vision) com prompt de extração de texto (OCR).
4. **Normalização (JavaScript):** O node `Normaliza Campos Imagem` utiliza lógica robusta para:
   - Tratar aninhamento de dados dinâmico da LangChain (`[[{...}]]`).
   - Consolidar `message` (texto extraído) e `image_base64`.
   - Evitar loops de dependência no n8n lendo nodes externos apenas uma vez fora de iterações.
5. **Agente de IA (Multi-Path Resilience):** O prompt do sistema no Agente de IA utiliza expressões condicionais (`isExecuted`) para buscar a mensagem do cliente no braço correto do fluxo (Texto vs Áudio vs Imagem), eliminando o erro de "Node hasn't been executed".

### 18.4 Handoff Humano (HITL)

```
Usuário: "quero falar com um atendente"
    ↓
N8N detecta intenção → chama Supabase API
    ↓
conversations.status = 'human_active'
conversations.assigned_operator_id = [operador disponível]
    ↓
AppContext polling detecta mudança (20s)
    ↓
UI: Chat muda de cor + ativa input do operador
    ↓
Operador responde → api.sendMessage() → N8N envia via Evolution/VAPI
```

---

## 19. Variáveis de Ambiente (`.env.local`)

```env
# Supabase (obrigatório)
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_ANON_KEY=[anon_key]

# OpenAI (para RAG e sugestão de políticas)
VITE_OPENAI_API_KEY=sk-...

# N8N (webhooks)
VITE_N8N_WEBHOOK_URL=https://[n8n-host]/webhook/[id]

# Proxy de desenvolvimento (vite.config.ts)
# /openai-api → https://api.openai.com
# /supabase-api → https://[project].supabase.co
```

---

## 20. Debt Técnico & Próximas Evoluções

> Ver arquivo `TECHNICAL_DEBT.md` para rastreamento detalhado.

### 20.1 Melhorias Identificadas

| Item | Prioridade | Descrição |
| :--- | :--- | :--- |
| Realtime (Supabase Channels) | Alta | Substituir polling de 20s por WebSocket. Eliminar re-renders desnecessários. |
| Paginação de Conversas | Alta | A lista carrega todas as conversas. Necessário `cursor-based pagination`. |
| `_capabilities` pattern | Média | Flag de capabilidade em runtime para fallback degradado de queries. Substituir por schema detection na boot. |
| Estágios de Fluxo (Insert) | Média | `createFlow` e `updateFlow` não persistem estágios no banco ainda (TODO). |
| Transferência de Conversa | Média | Precisa atualizar `assigned_operator_id` no banco ao transferir, não só no frontend/notas. |
| Testes E2E Completos | Média | Implementados testes de integração da API (Vitest), mas falta automação UI (Playwright) em fluxos como Playgrounds e Billing. |
| Webhook de Validação de Identidade (N8N) | Alta | A fundação e UI no Hub do Identity Gate estão prontos, falta o N8N realizar efetivamente o `POST` para validar a chave transacional preenchida na UI. |

### 20.2 Arquitetura Futura

- **Supabase Realtime:** Channels para atualização push de conversas (Resolve o problema do Polling escalar excessivamente quando 500+ operadores estiverem on-line).
- **Clusterização N8N Multi-Instance (SPOF Mitigation):** Com Redis já implantado, a evolução madura prevê desmembrar o webhook num Load Balancer operando múltiplos wokers n8n, impedindo queda local generalizada (Inbound/Outbound/Identity).
- **Smart Usage Allocation:** `brain_config.budget_share_pct` + `monthly_limit_brl` para controle de orçamento por agente.
- **Multi-LLM por Agente:** Provider registry dinâmico além de OpenAI/Anthropic.
- **Mobile App:** React Native para operadores em campo.

---

## 21. Histórico de Mudanças Críticas (Changelog Técnico)

### V14.0 — 16/Mar/2026 — Security Flow Redesign

#### 🐛 Bug Fix: `n8n_orchestrator_v5` — Sessão Expirada Retornando como `active`

**Problema:** A query que recupera o `session_status` da tabela `conversation_security_sessions` não verificava o campo `expires_at`. Sessões com status `active` mas prazo vencido eram retornadas como autenticadas, permitindo acesso a ferramentas financeiras sem autenticação válida.

**Fix aplicado** em `database/rpc/n8n_orchestrator_v5.sql`:
```sql
-- Expirar sessões que passaram do prazo (limpeza proativa)
UPDATE public.conversation_security_sessions
SET status = 'expired', updated_at = NOW()
WHERE conversation_id = v_conversation_id
  AND status = 'active'
  AND expires_at < NOW();

-- Buscar sessão ativa E dentro do prazo de validade
SELECT status, validated_identifier INTO v_security_session_status, v_security_identifier
FROM public.conversation_security_sessions
WHERE conversation_id = v_conversation_id
  AND status = 'active'
  AND expires_at > NOW()         -- ← Verificação crítica adicionada
ORDER BY created_at DESC LIMIT 1;
```

#### 🐛 Bug Fix: Switch1 — AI Agent com Tools Nunca Chamado

**Problema:** A Rule 0 do nó `Switch1` exigia `$json.allowToolExecution === true`. Esse campo só existia quando o `RPC Security Gatekeeper` era executado. Para usuários já autenticados, o `IF Security` bypassava o Gatekeeper, deixando `allowToolExecution = undefined`, fazendo o Switch rodar sempre para o `AI Agent Sem Ferramentas`.

**Fix:** Removida a dependência de `allowToolExecution`. O Switch1 agora usa exclusivamente `should_use_tools` do nó `Formatar Contexto`:

| Output | Condição (nova) | Destino |
| :--- | :--- | :--- |
| 0 (Tools) | `should_use_tools === true` | AI Agent (Conversacional/RAG) com tools |
| 1 (Sem Tools) | `should_use_tools !== true` | AI Agent (Sem Ferramentas) — solicita CPF |

#### 🐛 Bug Fix: Texto `"Calling...Tool with input:"` Enviado ao WhatsApp

**Problema:** A tabela `chat_histories_memory` (Postgres Chat Memory do LangChain) armazenava os textos intermediários de tool calls (ex: `"Calling Call n8n Workflow Tool with input: {...}"`) como mensagens. Em execuções subsequentes, o modelo lia esse histórico e reproduzia o padrão, enviando o texto técnico diretamente ao usuário.

**Fixes:**
1. **Limpeza de memória:** DELETE nas linhas da `chat_histories_memory` com `message::text ILIKE '%Calling %Tool%'`.
2. **Guardrail de output** (Code in JavaScript V7): Adicionado filtro `else if (/^Calling .+Tool with input:/i.test(msg))` que intercepta e substitui por mensagem neutra antes do envio ao WhatsApp.
3. **Desabilitar `Use Responses API`** no nó `OpenAI Chat Model`: A Responses API (nova API da OpenAI) mantém estado server-side e conflita com o Postgres Chat Memory (client-side). Deve permanecer **OFF** para compatibilidade.

#### ⚠️ Regra Estabelecida: OpenAI Responses API

> **NUNCA habilitar `Use Responses API`** nos nós de `OpenAI Chat Model` que utilizam `Postgres Chat Memory`. As duas tecnologias gerenciam estado de conversa de formas incompatíveis, causando o erro: `No tool call found for function call output with call_id [id]`.

---

*Este documento deve ser atualizado sempre que uma mudança significativa for feita no schema, nas rotas, ou na arquitetura de serviços.*
