# 🛡️ Nexus Hub — Arquitetura de Inteligência Transacional (SST)
> **Single Source of Truth (SST)**: Este documento é o manual definitivo do sistema, consolidando infraestrutura, orquestração de IA e governança operacional.

---

## 1. Visão Geral e Filosofia
O **Nexus Hub** não é apenas um chatbot; é uma **Torre de Controle de IA Transacional**. Sua arquitetura foi desenhada para transformar conversas em fluxos seguros, auditáveis e escaláveis, utilizando um modelo híbrido de orquestração.

### 🎯 Missão Técnica
- **Agnosticismo de Canal**: Funciona via WhatsApp (Evolution/Zenvia), Web Widget ou Voice (VAPI).
- **Segurança Determinística**: A IA não decide o que o usuário pode acessar; o banco de dados (Gatekeeper) decide.
- **Observabilidade Total**: Cada mensagem possui um `trace_id` (INC ou TRC) que permite rastreio end-to-end.
- **Segurança Proativa**: Zero chaves de API expostas no frontend. Todo processamento sensível ocorre no Server-side (Edge Functions).

---

## 2. Guia do Desenvolvedor Core (O Cérebro)

### 🚀 2.1. O Pipeline de Execução (Node Engine v2.0)
Adotamos o **Pipeline Pattern** para garantir que cada etapa do processamento de IA seja isolada e testável.
- **PipelineStep**: Interface base. Cada step (Guardrails, Intent, RAG, LLM) faz apenas uma coisa.
- **PipelineContext**: Objeto mutável que carrega o estado da mensagem. O `context_state` (JSONB) é o contrato de memória da conversa.
- **StepTracer**: Registra latência e sucesso de cada nó individualmente, permitindo debug visual (Langfuse + Dashboards Internos).

### 🧠 2.2. Context Factory (A RPC Mestra)
A inteligência do Nexus reside na RPC `public.fn_fetch_next_inbound_message`. Ela realiza:
1. **Hidratação de Prompt**: Substituição dinâmica de `{{LEAD_NAME}}` e metadados.
2. **Intelligent Sliding Window (V66.9)**: Injeção automática de resumos de conversas anteriores (`metadata->'summary'`) no histórico.
3. **Isolamento Temporal**: Se uma conversa é fechada e reaberta, o histórico antigo é ocultado da IA (Prevenção de alucinação).

### 🛡️ 2.3. Segurança Transacional (Identity Gate)
O sistema opera em 3 camadas de contenção:
1. **Layer 1 (Intent)**: Classificação semântica da intenção do usuário.
2. **Layer 2 (Gatekeeper)**: RPC `evaluate_conversation_security` valida se a intenção exige autenticação (ex: CNPJ).
3. **Layer 3 (Masking)**: Ferramentas financeiras são ocultadas do LLM se o usuário não estiver autenticado.

---

## 3. Infraestrutura Operacional (The Defender)

### 🚧 3.1. Porteiro Gateway (V2.5)
O serviço Node.js (Hono/Fastify) que guarda a entrada:
- **Inbound Ingestion**: Recebe webhooks, normaliza o payload e enfileira na `inbound_queue`.
- **Outbound Sync**: Escuta o banco (Realtime) para disparar mensagens instantâneas via Evolution ou Zenvia.
- **Scale Guardian**: Limite de 10-50 jobs simultâneos para evitar colapso de infraestrutura.

### 📡 3.2. Realtime Event Bus (Supabase Channels)
Arquitetura baseada 100% em eventos via WebSockets.
- **Canal `tenant-convs`**: Atualiza a lista lateral instantaneamente.
- **Canal `tenant-msgs`**: Atualiza o chat ativo com latência imperceptível.
- **Fallback**: Intervalo de 10 minutos para resincronização de estado pesado.

---

## 4. Stack Tecnológico & Camadas

| Camada | Tecnologia | Papel |
| :--- | :--- | :--- |
| **Frontend** | React 18 + Vite + TS | SPA estático via Vercel. |
| **Backend** | PostgreSQL 15 + PostgREST | Core do sistema com RLS nativo. |
| **Gateway** | Node.js (Porteiro) | API Gateway & Fila de Saída. |
| **Orquestração** | n8n (Node.js) | Motor de workflows de IA. |
| **Canais** | Evolution / Zenvia / VAPI | Interfaces de comunicação. |
| **Inference** | OpenAI / Anthropic | Cérebro via Edge Functions. |

---

## 5. Rotas da Aplicação (Frontend)

| Rota | Componente | Descrição |
| :--- | :--- | :--- |
| `/` | `Index.tsx` | Dashboard Principal (Campanha Executiva). |
| `/conversations` | `Conversations.tsx` | Inbox de conversas em tempo real. |
| `/agents` | `Agents.tsx` | Gestão de agentes e RAG. |
| `/campaigns` | `Campaigns.tsx` | Gestão de disparos e outbound. |
| `/ai-performance` | `AIPerformanceCenter.tsx` | Centro de métricas estratégicas. |

---

## 6. Auth V2 & RBAC

O sistema utiliza **Supabase Auth** vinculado à tabela `public.users`.
- **Perfis (Profiles)**: Super Admin, Tenant Admin, Operador e Visualizador.
- **Permissões**: Gerenciadas via `profile_permissions`, com controle granular por módulo (Dashboard, Conversas, Agentes, etc).

---

## 7. Schema do Banco de Dados

### 7.1 Principais Tabelas
- **`companies`**: Cadastro de tenants e configurações de privacidade.
- **`agents`**: Configurações de LLM (`brain_config`) e Provedores (Evolution/Zenvia).
- **`conversations`**: Estado ativo das conversas (`ai_active`, `human_active`, `closed`).
- **`messages`**: Histórico imutável de mensagens com `trace_id`.
- **`campaigns` & `outbound_queue`**: Motor de disparos em massa.
- **`inbound_queue`**: Fila de recepção para processamento assíncrono.
- **`dash_cache`**: Cache de performance para dashboards executivos.

---

## 8. RPCs (Remote Procedure Calls)

| RPC | Papel |
| :--- | :--- |
| `get_dashmaster_v1` | Master Query para Dashboards (Consumo, Financeiro, KPIs). |
| `fn_fetch_next_inbound_message` | Busca mensagem da fila com Lock atômico. |
| `log_link_conversion` | Registra cliques no Action Tracking e prioriza conversa. |
| `get_next_leads_secure` | Recupera leads para campanha com Frequency Capping. |

---

## 9. Campanhas & Outbound (CRM V2)

### 📈 9.1 Funil de Conversão (Edenred SLA)
Métricas baseadas em **Ações Reais**:
- **Carga Total**: Denominador mestre para o cálculo de Yield.
- **Conversão**: Leads que atingiram o critério de sucesso (ex: Link de Proposta enviado).

### 🔗 9.2 Ponte de Conversão (Action Tracking V66.20)
- **Redirecionador**: `/v1/l/:trace_id` atua como bridge de telemetria.
- **Impacto no Dashboard**: O clique do lead gera uma mensagem na timeline e sobe a conversa na lista de prioridade.

---

## 10. Performance & Escalabilidade

- **Cache Layer**: TTL de 5 min na `dash_cache` para reduzir carga de CPU.
- **Batching**: Suporte a processamento em lote (Batch 1 para Anti-Spam, 10-50 para Volume).
- **Auto-Recovery**: Script que limpa leads parados no status `processing` após 30 min.

---

## 11. Governança & Segurança (ISO 42001)

- **Audit Logs**: Registro imutável de todas as alterações em agentes e políticas.
- **Decision Logs**: Rastreabilidade do porquê a IA tomou determinada ação.
- **Guardrails**: Regras `canDo` e `cannotDo` injetadas em tempo de execução.

---

## 12. Privacidade & LGPD

- **Data Masking**: Telefones e CPFs são mascarados no frontend.
- **Anonymization**: Prazos de retenção de dados configuráveis por tenant.

---

## 13. Histórico de Evolução (Changelog)

### [V66.20] - Atualização de Estabilidade
- Implementação da **Ponte de Conversão** (Action Tracking).
- Busca Híbrida no Dashboard (Filtro por Nome da Empresa).
- Estabilização da RPC `get_next_leads_secure`.

### [V66.9] - Sliding Window
- Injeção de resumos de conversa no contexto da IA.

---

## 14. Variáveis de Ambiente

```env
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_ANON_KEY=[anon_key]
VITE_N8N_WEBHOOK_URL=https://[n8n-host]/webhook/[id]
# OpenAI Key: Proibida no frontend. Usar Edge Functions.
```

---
*Este documento é a Única Fonte da Verdade (SST) para o Davos Nexus V66.20.*
