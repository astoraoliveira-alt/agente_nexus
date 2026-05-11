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

### 🧠 2.2. Context Factory (A RPC Mestra)
A inteligência reside na RPC `public.fn_fetch_next_inbound_message`:
1. **Hidratação de Prompt**: Substituição dinâmica de metadados.
2. **Intelligent Sliding Window**: Injeção automática de resumos de conversas anteriores (`metadata->'summary'`).

### 🛡️ 2.3. Segurança Transacional (Identity Gate)
- **Layer 1 (Intent)**: Classificação semântica da intenção.
- **Layer 2 (Gatekeeper)**: Validação de Auth (CNPJ/CPF).
- **Layer 3 (Masking)**: Ferramentas sensíveis são ocultadas de usuários não autenticados.

---

## 3. Infraestrutura Operacional (The Defender)

### 🚧 3.1. Porteiro Gateway (V2.5)
- **Inbound Ingestion**: Recebe webhooks, normaliza e enfileira na `inbound_queue`.
- **Outbound Sync**: Escuta o banco (Realtime) para disparar mensagens instantâneas.
- **Scale Guardian**: Controle de concorrência (10-50 jobs).

### 📡 3.2. Realtime Event Bus
- Arquitetura baseada 100% em WebSockets (Supabase Channels).
- Latência alvo: < 150ms.

---

## 4. Performance & Escalabilidade

### ⚡ 4.1. Cache Layer (Dashmaster)
- **Tabela**: `public.dash_cache`.
- **TTL**: 5 minutos.
- **Invalidação**: Gatilhos em tempo real em tabelas de mensagens e métricas.

### 🛑 4.2. Frequency Capping
- Travas de segurança por lead (`max_per_day`).
- Mecanismo de auto-recuperação para leads travados em "processing".

---

## 5. Inteligência de Conhecimento (RAG)

### 📚 5.1. Base de Conhecimento Server-Side
- **Processamento**: Supabase Edge Functions.
- **Segurança**: Chaves OpenAI nunca tocam o frontend.
- **Vetores**: `pgvector` com Cosine Similarity.

---

## 6. Leads & Campanhas (CRM V2)

### 📊 6.1. Insights Executivos (V56.0)
- **Yield vs Base**: Eficiência real ponderada sobre a carga total.
- **Funil de 6 Estágios**: Da carga inicial até a conversão final.

### 🔗 6.2. Ponte de Conversão (Action Tracking V66.20)
- **Bridge**: `/v1/l/:trace_id` para redirecionamento inteligente.
- **Telemetria**: Log automático na timeline da conversa via RPC `log_link_conversion`.

---

## 7. Histórico de Evolução (Changelog V66.20)

### [V66.20] - Atualização de Estabilidade
- Implementada a Ponte de Conversão (Action Tracking).
- Busca Híbrida no Dashboard de Conversas (Nome da Empresa).
- Correção de ambiguidade de `tenant_id` em RPCs críticas.

### [V66.10] - Capping & Recovery
- Introdução de Frequency Capping por agente.
- Sistema de limpeza automática de filas.

---

## 8. Variáveis de Ambiente

```env
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_ANON_KEY=[anon_key]
VITE_N8N_WEBHOOK_URL=https://[n8n-host]/webhook/[id]
# OpenAI/Anthropic: Configuradas no Server-side apenas.
```

---
*Este documento é a Única Fonte da Verdade (SST) para o Davos Nexus V66.20.*
