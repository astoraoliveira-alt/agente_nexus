# Davos Nexus — Análise Estratégica Multidimensional
> Versão do documento analisado: V65.0 | Data: Mai/2026

---

## PARTE 1 — OLHAR DO ARQUITETO
### Performance, Escala e Transações por Minuto sem Perda de Contexto

---

### 1.1 Diagnóstico da Arquitetura Atual

O Nexus Hub é uma plataforma **event-driven** bem projetada para o estágio atual. A decisão de centralizar lógica de negócio no PostgreSQL via RPCs é acertada — reduz latência e elimina round-trips desnecessários. Porém, ao escalar para alto volume (10k+ leads simultâneos), surgem gargalos estruturais.

---

### 1.2 Gargalos Identificados

#### 🔴 Gargalo Crítico: Single Worker N8N com Batch Size 1

```
ATUAL:
  outbound_queue → n8n (Batch Size 1, cadência 5s)
  Capacidade máxima: ~12 disparos/min por worker

PROBLEMA:
  10.000 leads numa campanha = ~14h de processamento num único worker
  Sem paralelismo declarado por campanha
```

**Recomendação:** Implementar particionamento horizontal da `outbound_queue` por `campaign_id`. N8n deve consumir com `Batch Size 10-50` com controle de concorrência por tenant (já existe o `max_concurrency` no schema do agente — mas não está sendo usado na fila de outbound).

#### 🔴 Gargalo Crítico: AppContext com Polling Misto

O `AppContext` ainda usa polling de **20s para conversas** e **5s para mensagem ativa**. Com múltiplos operadores logados, isso gera N×(20s + 5s) queries simultâneas no Supabase.

**Recomendação:** Migrar 100% para Supabase Realtime Channels com filtro por `tenant_id`. A infraestrutura já existe (V49+), mas o polling de 20s não foi removido.

#### 🟡 Gargalo Moderado: RPCs Monolíticas (get_dashmaster_v1)

A `get_dashmaster_v1` consolida KPIs, ROI, rankings, gráficos e financials em 1 chamada. Excelente para latência percebida, mas qualquer lentidão num sub-cálculo bloqueia todo o dashboard.

**Recomendação:** Adicionar cache de resultado no Redis (TTL 30s) para essa RPC. O Porteiro já tem acesso ao Redis — criar um cache-aside pattern.

#### 🟡 Gargalo Moderado: Fila Inbound sem Sharding

A `inbound_queue` é uma tabela única sem particionamento. Com o `FOR UPDATE SKIP LOCKED`, o sistema funciona bem até ~200 TPS. Acima disso, o lock contention cresce exponencialmente.

**Recomendação:** Particionar a `inbound_queue` por `tenant_id` (PostgreSQL 15 native partitioning). Cada tenant tem sua própria "fatia" da tabela — zero contenção entre tenants diferentes.

#### 🟡 Gargalo Moderado: Contexto de Conversa sem TTL Explícito

O `context_window` é configurável por agente (campo INT na tabela `agents`), mas o histórico é carregado via `fn_fetch_next_inbound_message` sem compressão. Em conversas longas, o payload enviado ao OpenAI cresce linearmente.

**Recomendação:** Implementar **Sliding Window com Sumarização**. Quando a conversa ultrapassar X mensagens, um worker comprime as mensagens mais antigas em um `summary` e mantém apenas as N mais recentes + o summary no contexto.

---

### 1.3 Melhorias de Resiliência

| Área | Problema Atual | Solução Recomendada |
|------|---------------|---------------------|
| **Banco Down** | Recovery manual via log local da VPS | Implementar WAL-based message buffer no Porteiro com flush quando DB volta |
| **N8N Down** | Recovery Worker re-tenta após 2 min | Reduzir para 30s com backoff progressivo (30s, 1min, 2min, 4min) |
| **Rate Limit OpenAI** | Scale Guardian limita a 50 jobs | Adicionar retry com circuit breaker + fallback para modelo menor (GPT-3.5) |
| **Supabase Replica Lag** | Primary Force em queries críticas (V63) | Implementar `read-your-writes` session token para garantir consistência pós-write |

---

### 1.4 Capacidade de Escala Estimada

| Cenário | Arquitetura Atual | Com Melhorias |
|---------|------------------|---------------|
| Leads/hora (outbound) | ~720 | ~15.000 |
| TPS inbound (mensagens) | ~200 | ~2.000 |
| Tenants simultâneos ativos | ~50 | ~500 |
| Contexto máximo por conversa | ~30 mensagens | Ilimitado (com compressão) |

---

## PARTE 2 — OLHAR DO GERENTE DE PRODUTO
### O que a plataforma já tem vs. o que uma área de negócios de Campanhas precisa

---

### 2.1 O que já existe (pontos fortes para o negócio)

✅ **Motor de Campanha Outbound completo** — criação, importação de leads, deduplicação, fila de disparo, limite diário, janela horária  
✅ **Funil de Conversão em 6 estágios** — da carga até o yield real, com métricas de entrega, leitura, interação e conversão  
✅ **Dashboard Executivo** — S-curves, KPIs em tempo real, primeira conversão única (anti-inflação)  
✅ **Critérios de Sucesso Customizáveis** — `CLIENT_RESPONDED`, `LINK_SENT` por padrão de URL  
✅ **Incident Broadcast Engine** — disparo emergencial com modos Passivo/Ativo/Híbrido  
✅ **HITL com SLA** — fila de atendimento humano com TMR em tempo real  
✅ **Kanban de Leads** — Lead → MQL → SQL → Customer com movimentação automática por score  

---

### 2.2 Lacunas Críticas para uma Área de Negócios de Campanhas

#### ❌ Ausente: Agendamento de Campanha com Recorrência

O sistema tem `start_date`/`end_date` e `start_time`/`end_time`, mas não existe **recorrência automática**. Uma área de marketing que roda campanhas semanais precisa criar manualmente cada ciclo.

**Gap:** Sem cron de campanha recorrente. Exemplos de uso: "Toda segunda-feira, disparar para leads inativos há 30 dias."

#### ❌ Ausente: Segmentação Dinâmica de Audiência

Não existe um **Query Builder de audiência** que filtre contatos em tempo real por critérios combinados (ex: `lifecycle_status = SQL AND tag = "interesse_produto_X" AND última_interação > 60 dias`). A importação é sempre por arquivo CSV.

**Gap:** Para campanhas de reengajamento e upsell, a área precisa montar audiências on-the-fly sem depender de exportação/importação.

#### ❌ Ausente: A/B Testing Nativo

O schema menciona "Escalabilidade A/B" na V54, mas não há interface ou lógica formal para split de audiência entre variantes de mensagem ou de agente. O time de marketing não consegue testar hipóteses de copy ou abordagem de forma sistemática.

**Gap:** Sem A/B testing, campanhas dependem de intuição. Times de alta performance precisam de testes contínuos.

#### ❌ Ausente: Score de Engajamento Histórico por Lead

O sistema rastreia `response_detected` (boolean) por campanha, mas não existe um **score de engajamento acumulado por contato** ao longo de todas as campanhas. Um lead que respondeu em 3 das 5 campanhas anteriores deveria ser priorizado.

**Gap:** Sem esse score, todos os leads têm o mesmo peso independente do histórico.

#### ❌ Ausente: Controle de Pressão de Contato (Frequency Capping)

Não há regra que impeça que o mesmo lead receba mensagens de múltiplas campanhas simultâneas ou em janelas muito próximas. Isso aumenta opt-outs e pode prejudicar a saúde do número de WhatsApp.

**Gap:** Sem frequency capping, campanhas concorrentes podem queimar contatos valiosos.

#### ❌ Ausente: Automação Pós-Conversão (Nurture Flow)

Quando um lead converte (atinge o critério de sucesso), não existe fluxo automático pós-conversão — um "Obrigado + próximo passo" ou transição para uma nova campanha de retenção.

**Gap:** A conversão encerra a jornada no sistema atual. Retenção e upsell exigem nova campanha manual.

#### ❌ Ausente: Relatório Comparativo entre Campanhas

Existe dashboard por campanha, mas não existe uma **visão comparativa** que mostre side-by-side múltiplas campanhas — "Campanha de Julho teve 12% de conversão vs Campanha de Agosto com 8% — o que mudou?".

**Gap:** Sem benchmarking entre campanhas, o time não consegue iterar com dados.

---

## PARTE 3 — OLHAR DO VISIONÁRIO
### O que está em alta globalmente em ferramentas do mesmo segmento

---

### 3.1 Tendências de Mercado (2025-2026) em AI Engagement Platforms

Ferramentas como **Intercom**, **HubSpot AI**, **Salesforce Einstein**, **Drift**, **Customer.io** e **Attentive** estão convergindo em algumas direções claras:

---

#### 🚀 Tendência 1: AI-Native Segmentation (Contextual Audiences)

Plataformas líderes abandonaram o query builder estático. A nova geração usa LLM para responder em linguagem natural: *"Encontre leads B2B do setor de saúde que responderam mas não compraram nos últimos 45 dias."*

**O que o Nexus precisa:** Conectar o GPT-4o ao CRM (`contacts` + `conversations` + `evaluations`) para montar audiências via linguagem natural. A infraestrutura de embeddings (RAG) já existe — basta criar um "Audience Builder AI".

---

#### 🚀 Tendência 2: Multi-step Automated Journeys (Customer Journey Orchestration)

Ferramentas como Customer.io e ActiveCampaign evoluíram para orquestração de jornadas completas: o lead entra num fluxo e avança/regride automaticamente baseado em comportamento (abriu mensagem → esperou 48h → não respondeu → enviou follow-up diferente).

**O que o Nexus precisa:** Um **Journey Builder visual** sobre os `flows` existentes, adicionando ramificações condicionais baseadas em eventos reais (`response_detected`, `link_clicked`, `time_elapsed`). O sistema de `flows` + `flow_stages` é a fundação — falta o motor de automação temporal.

---

#### 🚀 Tendência 3: Revenue Attribution (Multi-Touch)

Plataformas enterprise estão respondendo a C-Level com atribuição de receita por canal, agente, campanha e touchpoint. Não é apenas "essa campanha converteu X%", mas "essa campanha gerou R$ Y em receita fechada".

**O que o Nexus precisa:** Integrar o campo `metadata` dos contatos (onde já tem `cnpj`, valor de proposta, etc.) com um modelo de atribuição que calcule ARR/LTV por campanha. O ROI atual é baseado em horas economizadas — para B2B, o ROI em R$ de receita gerada é muito mais poderoso.

---

#### 🚀 Tendência 4: Sentiment Analysis em Tempo Real

Ferramentas como Zendesk e Gorgias analisam sentiment a cada mensagem e ajustam a abordagem da IA automaticamente — detectando frustração antes do churn.

**O que o Nexus precisa:** Adicionar `sentiment_score` (positivo/neutro/negativo) ao payload de cada mensagem processada pelo n8n. O GPT-4o já processa cada mensagem — é só adicionar classificação de sentimento no output do LLM e persistir em `messages.metadata`. O HITL poderia ser acionado automaticamente quando sentiment < threshold.

---

#### 🚀 Tendência 5: Predictive Lead Scoring (AI-driven)

Plataformas como HubSpot AI e Salesforce Einstein usam modelos preditivos que analisam padrões históricos para prever quais leads têm maior probabilidade de conversão.

**O que o Nexus precisa:** Com o volume de `evaluations` + `outbound_queue` + `conversations` acumulado, já existe dados suficientes para treinar um modelo simples de scoring preditivo. No curto prazo, uma RPC de scoring baseado em regras (tempo de resposta, quantidade de mensagens, score de auditoria anterior) já seria diferencial.

---

#### 🚀 Tendência 6: WhatsApp Interactive Templates + Buttons (Rich Messaging)

As principais plataformas de engagement estão explorando ao máximo os recursos da Meta API — mensagens com botões, listas, carrosséis de produtos, pagamentos dentro do WhatsApp.

**O que o Nexus precisa:** O sistema atual é text-first. Adicionar suporte a `interactive_message_type` na `outbound_queue` (button, list, template) abriria um novo nível de conversão — especialmente para vendas B2C.

---

## PARTE 4 — CRONOGRAMA ESTRATÉGICO
### Priorização por Valor × Impacto × Complexidade

---

### Metodologia de Priorização

Cada item foi avaliado em três dimensões (1-5):
- **Valor Negócio:** Impacto direto em receita ou retenção de clientes
- **Esforço:** Complexidade técnica (5 = muito complexo)
- **Urgência:** Dor atual sentida pelos usuários da plataforma

**Score = (Valor × Urgência) / Esforço**

---

### Sprint 1 — Quick Wins (2-4 semanas)

| # | Feature | Valor | Esforço | Score | Origem |
|---|---------|-------|---------|-------|--------|
| 1.1 | **Sentiment Score em mensagens** (classificação LLM inline) | 4 | 2 | 8.0 | Visionário |
| 1.2 | **Frequency Capping** (regra: máx. N campanhas/lead/semana) | 5 | 2 | 7.5 | PM |
| 1.3 | **Cache Redis na get_dashmaster_v1** (TTL 30s) | 4 | 1 | 8.0 | Arquiteto |
| 1.4 | **Relatório comparativo entre campanhas** (view SQL + UI) | 4 | 2 | 7.0 | PM |
| 1.5 | **Remoção do polling de 20s** (migrar para Realtime 100%) | 3 | 1 | 7.5 | Arquiteto |

**Investimento estimado:** 40-80h de desenvolvimento  
**Retorno esperado:** Redução de 40% em queries ao Supabase + retenção de clientes de campanhas

---

### Sprint 2 — Crescimento (1-2 meses)

| # | Feature | Valor | Esforço | Score | Origem |
|---|---------|-------|---------|-------|--------|
| 2.1 | **A/B Testing nativo** (split de audiência, variantes de mensagem) | 5 | 3 | 6.7 | PM |
| 2.2 | **Score de Engajamento Histórico por Lead** (RPC com histórico cross-campanha) | 5 | 2 | 7.5 | PM |
| 2.3 | **Particionamento da inbound_queue por tenant_id** | 4 | 3 | 5.3 | Arquiteto |
| 2.4 | **Batch Size configurable no n8n outbound** (10-50 por campanha) | 5 | 2 | 7.5 | Arquiteto |
| 2.5 | **WhatsApp Interactive Messages** (buttons, lists na outbound_queue) | 5 | 3 | 6.7 | Visionário |

**Investimento estimado:** 120-200h  
**Retorno esperado:** 3-5x throughput em campanhas + diferencial competitivo em conversão

---

### Sprint 3 — Plataforma (2-3 meses)

| # | Feature | Valor | Esforço | Score | Origem |
|---|---------|-------|---------|-------|--------|
| 3.1 | **Journey Builder visual** (automação temporal sobre flows existentes) | 5 | 4 | 5.0 | Visionário |
| 3.2 | **Segmentação Dinâmica de Audiência** (query builder no CRM) | 5 | 3 | 5.6 | PM |
| 3.3 | **Nurture Flow automático pós-conversão** | 4 | 3 | 4.8 | PM |
| 3.4 | **Campanha Recorrente** (agendamento com cron nativo) | 4 | 3 | 4.8 | PM |
| 3.5 | **Sliding Window com Sumarização de Contexto** | 4 | 3 | 5.3 | Arquiteto |

**Investimento estimado:** 200-350h  
**Retorno esperado:** Posiciona a plataforma como solução enterprise-grade de jornada completa

---

### Sprint 4 — Diferenciação (3-6 meses)

| # | Feature | Valor | Esforço | Score | Origem |
|---|---------|-------|---------|-------|--------|
| 4.1 | **AI Audience Builder** (segmentação por linguagem natural via GPT-4o) | 5 | 4 | 5.0 | Visionário |
| 4.2 | **Revenue Attribution** (atribuição de receita multi-touch por campanha) | 5 | 4 | 5.0 | Visionário |
| 4.3 | **Predictive Lead Scoring** (modelo baseado em histórico de evaluations) | 5 | 4 | 4.2 | Visionário |
| 4.4 | **Particionamento horizontal da outbound_queue** por tenant | 4 | 4 | 4.0 | Arquiteto |
| 4.5 | **WAL-based message buffer** no Porteiro (resilência total ao DB Down) | 3 | 4 | 2.6 | Arquiteto |

**Investimento estimado:** 350-600h  
**Retorno esperado:** Posiciona o Nexus como plataforma de inteligência comercial, não apenas de automação

---

## RESUMO EXECUTIVO

O **Davos Nexus** está numa posição sólida: a arquitetura event-driven é correta, o modelo de dados é bem desenhado e a cobertura funcional para campanhas já é significativa. O sistema está pronto para os próximos 10-20x de crescimento com os ajustes de Sprint 1 e 2.

**Os três maiores riscos técnicos hoje:**
1. N8N com Batch Size 1 no outbound — escala linearmente, não horizontalmente
2. Polling de 20s ainda ativo no AppContext — desperdício em multi-operator
3. Falta de frequency capping — risco de queimar listas de contatos

**As três maiores oportunidades de produto:**
1. A/B Testing + Score de Engajamento — posicionamento de plataforma séria de marketing
2. Journey Builder — diferencial absoluto frente a soluções pontuais de WhatsApp
3. Revenue Attribution em R$ — o argumento de venda que fecha enterprise

**Visão 12 meses:** Com os 4 sprints executados, o Nexus deixa de ser uma "ferramenta de automação de WhatsApp" e passa a ser uma **plataforma de inteligência comercial omnichannel** — com o único diferencial do mercado brasileiro de ter governança de IA (ISO 42001) nativa.

---
*Documento gerado em 09/Mai/2026 | Baseado na documentação V65.0 do Davos Nexus*
