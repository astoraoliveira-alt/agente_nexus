# Plano de Arquitetura, Performance e Isolamento de Carga — Davos AI Workspace

> **Documento vivo de especificação de negócio e especificação técnica**
> **Data da baseline:** 24/11/2026
> **Objetivo deste documento:** Servir como contrato técnico e de negócio autossuficiente para que qualquer engenheiro ou modelo de LLM no Antigravity consiga executar as 3 frentes de evolução de performance e isolamento **sem perder contexto, sem simplificar regras de negócio e sem quebrar funcionalidades existentes**.

---

## 1. Contexto Atual & Diagnóstico Empírico (Baseline 24/11/2026)

### 1.1 Infraestrutura Atual
- **VPS Netcup (`RS 2000 G12`, Manassas US):** `8 vCPUs AMD64`, `16 GB RAM`, `512 GB Disco`. Hoje roda apenas **n8n** e **Porteiro** (altamente subutilizada).
- **Supabase (`wyfmyipbvoggusclwdhj`):**
  - **Primary (`us-west-2`):** em upgrade de `SMALL (2 GB RAM Shared)` para `MEDIUM (4 GB RAM Shared)` (futuramente `LARGE 8 GB Dedicated`).
  - **Read Replica (`stbul`, `sa-east-1` São Paulo):** serve as leituras pesadas do frontend via `supabaseReader` (`src/lib/supabase.ts`).
  - **Tamanho do banco:** `4.6 GB` de dados + `464 MB` de WAL.
- **Fase 1 já executada e em produção (`20261124_phase1_performance_isolation.sql` + `AppContext.tsx`):**
  - Corrigido o cast `(metadata->>'message_id')::uuid` em `handle_message_status_update` (`591,8 ms` → `0,777 ms`).
  - Aplicado throttle de `5s` em `fn_sync_campaign_stats` + índice `idx_outbound_queue_campaign_status_all` (`3,106 ms`).
  - Criados índices `pg_trgm` em `conversations (user_name, user_identifier)` (`0,600 ms`).
  - Removidos 6 índices 100% duplicados.
  - Corrigido bug de `payload.new.from_me` (coluna inexistente) em `src/contexts/AppContext.tsx`, bloqueando tempestades de `debouncedRefresh()` durante disparos.

### 1.2 Métricas Reais Observadas no Banco (`pg_stat_user_tables` e `pg_stat_statements`)
| Tabela / RPC | Tamanho / Volume | Problema Observado |
|---|---|---|
| `agent_success_memory` | `1.477 MB` (`95.359` linhas) | Ocupa ~32% do banco inteiro sem política de retenção |
| `inbound_queue` | `727 MB` (`30.648` linhas) | Bloat severo de payloads JSON antigos + `56.870` seq_scans |
| `inbound_queue_errors` | `349 MB` (`6.343` linhas) | Bloat de payloads de erro antigos sem expurgo |
| `integration_logs` + `agent_audit_logs` | `362 MB` (`48.311` linhas) | Logs históricos crescendo sem TTL |
| `messages` | `493 MB` (`403.703` linhas) | `1.241.961` seq_scans históricos |
| `outbound_queue` | `329 MB` (`156.983` linhas) | `850.680` seq_scans históricos (mitigados na Fase 1) |
| `get_sales_cockpit_leads` | `34.585` chamadas | Média de **`3.454,5 ms`** (~33h acumuladas de CPU — 2ª query mais cara) |
| RPCs analíticas de Dashboard | `1.604 ms` – `3.876 ms` | Recalculam agregações ao vivo sobre centenas de milhares de linhas |
| `AppContext.tsx` | `1.372` linhas | Contexto monolítico com 4 canais Realtime disparando refetches amplos |
| `ROTEADOR_DE_CONTEXTO_COMPLETO.js` | `2.815` linhas | Lógica crítica colada manualmente em node JS do n8n sem CI/testes |

---

## 2. Regras Invioláveis de Negócio & Engenharia (Para Qualquer LLM)

Antes de executar qualquer item deste plano, **respeite obrigatoriamente**:

1. **NUNCA simplifique regras de negócio em funções SQL ou TypeScript** para ganhar performance. O resultado funcional (contagens, filtros, status de funil, regras de elegibilidade do Cockpit, mensagens de crédito) deve ser **100% idêntico** antes e depois da otimização.
2. **NUNCA aplique alterações de schema diretamente no banco sem criar arquivo versionado** em `database/migrations/YYYYMMDD_<descricao>.sql`.
3. **SEMPRE valide toda alteração SQL** com:
   - Smoke test comparando saída (contagem e amostra de linhas) antes vs. depois.
   - `EXPLAIN (ANALYZE, COSTS OFF)` comprovando uso de índice e queda real de latência.
4. **NUNCA quebre ou substitua padrões consolidados da Sprint 1.** Estenda componentes, hooks e serviços existentes (`src/lib/supabase.ts`, `src/services/campaigns.service.ts`, `src/services/dashboard.service.ts`, `src/contexts/AppContext.tsx`).
5. **NUNCA delete dados operacionais ativos** (conversas, mensagens de clientes, `agent_leads`, `fiserv_audit_logs`, `whatsapp_billing_windows`). Políticas de retenção (TTL) aplicam-se **exclusivamente** a tabelas de fila já processada e logs técnicos temporários.

---

## 3. ITEM 1 — Política Automática de Retenção (TTL) + Otimização de `get_sales_cockpit_leads`

### 3.1 Especificação de Negócio
- **Por que fazer:** Mesmo após o upgrade do Supabase para `MEDIUM (4 GB RAM)`, o banco atual (`4.6 GB`) já ultrapassa a memória RAM disponível. Quando o working set não cabe em RAM, o PostgreSQL faz leitura constante de disco (*cache thrashing*), derrubando a velocidade de pesquisa de conversas e do Cockpit de Vendas durante disparos. Além disso, operadores no Cockpit de Vendas enfrentam lentidão de `3,4s+` a cada filtro/abertura.
- **Resultado esperado para o negócio:**
  - Reduzir o tamanho físico do banco de `4.6 GB` para **`~1.8 GB – 2.2 GB`**, mantendo os dados ativos 100% em RAM.
  - Reduzir o tempo médio do Cockpit de Vendas (`get_sales_cockpit_leads`) de **`3.450 ms`** para **`< 300 ms`** sem alterar nenhum lead exibido ou regra de estágio.
  - Garantir que o banco não volte a inchar nos próximos meses por meio de rotina semanal automatizada.

### 3.2 Especificação Técnica

#### Parte A — Retenção Automática (`pg_cron`) para Filas e Logs Técnicos
- **Migration:** `database/migrations/YYYYMMDD_retention_policy_queues_and_logs.sql`
- **Escopo de limpeza (apenas registros já concluídos/antigos):**
  1. `public.inbound_queue`: deletar registros com `status IN ('done', 'completed', 'ignored', 'processed')` e `created_at < NOW() - INTERVAL '15 days'`.
  2. `public.inbound_queue_errors`: deletar registros com `created_at < NOW() - INTERVAL '30 days'`.
  3. `public.integration_logs`: deletar registros com `created_at < NOW() - INTERVAL '30 days'`.
  4. `public.agent_audit_logs`: deletar registros com `created_at < NOW() - INTERVAL '60 days'`.
  5. `public.agent_success_memory` (`1.477 MB`): **NÃO deletar sem validação prévia.** Primeiro auditar com `SELECT count(*), pg_size_pretty(sum(pg_column_size(t))) FROM agent_success_memory t GROUP BY ...` se é usada em RAG ativo ou se possui embeddings/duplicatas obsoletas. Se for usada apenas em janela recente, definir janela de retenção com o Product Owner antes de expurgar.
- **Execução segura (sem travar o banco):**
  - Criar função `public.fn_purge_operational_logs(p_batch_size int DEFAULT 5000)` que deleta em lotes de `5.000` linhas (evita locks longos e picos de WAL).
  - Agendar via `pg_cron` para rodar de madrugada (ex.: domingos `06:00 UTC` = `03:00 BRT`).
  - Após a primeira limpeza histórica (executada de madrugada), rodar `VACUUM ANALYZE` nas tabelas limpas (ou `VACUUM FULL` apenas em janela de manutenção de madrugada para devolver espaço físico ao disco).

#### Parte B — Otimização de `get_sales_cockpit_leads`
- **Arquivo atual de referência:** `database/migrations/20261119_optimize_get_sales_cockpit_leads.sql`
- **Procedimento obrigatório para a LLM:**
  1. Ler a definição ativa no banco (`SELECT pg_get_functiondef(...)`) e salvar o resultado atual para um `tenant_id` real (`COUNT(*)` e distribuição por `stage`) como **gabarito de regressão**.
  2. Rodar `EXPLAIN (ANALYZE, BUFFERS)` na chamada real de `get_sales_cockpit_leads` para identificar os nós mais caros (ex.: subqueries correlacionadas em `messages`, `JSONB ->>` sem índice de expressão, ordenação em disco ou CTEs materializadas desnecessariamente).
  3. Criar índices específicos para os predicados reais identificados (ex.: índice de expressão parcial em `agent_leads ((metadata->>'fiserv_status')) WHERE (metadata->>'fiserv_status') IS NOT NULL` ou índices compostos em `handoff_requests`).
  4. Otimizar a query preservando **100% das colunas, tipos de retorno, filtros (`p_stage_filter`, `p_user_role`, `p_campaign_id`, `p_agent_id`) e regras de classificação**.
  5. Comparar a saída da função otimizada contra o gabarito de regressão (**0 divergências permitidas**) e validar latência `< 300 ms`.

---

## 4. ITEM 2 — Materialized Views no Dashboard + Desacoplamento do `AppContext.tsx`

### 4.1 Especificação de Negócio
- **Por que fazer:** Hoje, cada abertura ou refresh do Dashboard executa RPCs pesadas (`get_dashboard_summary`, `get_dashmaster_v1`, `get_edenred_conversion_funnel`, `get_campaign_leads_enriched`) diretamente sobre centenas de milhares de registros vivos. Simultaneamente, no frontend, `src/contexts/AppContext.tsx` centraliza todo o estado global e refaz queries amplas a cada evento Realtime.
- **Resultado esperado para o negócio:**
  - Dashboard e telas de métricas carregando em **`< 100 ms`**, completamente imunes a disparos simultâneos de 10.000+ mensagens.
  - Tela de Conversas fluida, sem piscar ou travar, atualizando instantaneamente apenas a conversa que recebeu mensagem do cliente.
  - Redução de > 70% na CPU da Read Replica (`stbul`).

### 4.2 Especificação Técnica

#### Parte A — Materialized Views / Snapshots para o Dashboard
- **Migration:** `database/migrations/YYYYMMDD_dashboard_materialized_views.sql`
- **Estratégia:**
  1. Criar Materialized Views com **Unique Index obrigatório** (para permitir `REFRESH MATERIALIZED VIEW CONCURRENTLY`, que **nunca bloqueia leituras**):
     - `public.mv_campaign_funnel_summary`: pré-agrega por `(tenant_id, campaign_id)` os totais de `outbound_queue` (`sent`, `delivered`, `read`, `failed`, `not_delivered`, `response_detected`) e `agent_leads` (`opt_in`, `comite_approved`, `denied`, `in_progress`, `formalized`, valores aprovados).
     - `public.mv_tenant_daily_metrics`: pré-agrega métricas diárias por `(tenant_id, date_brt)` para gráficos do Dashboard executivo.
  2. Agendar atualização via `pg_cron` a cada **2 minutos** (`*/2 * * * *`):
     ```sql
     REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_campaign_funnel_summary;
     REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_tenant_daily_metrics;
     ```
  3. Adaptar as RPCs de leitura de resumo (`get_dashboard_summary`, `get_dashmaster_v1`) para ler dessas MVs mantendo a assinatura exata e o mesmo JSON de retorno.
  4. **Atenção:** Telas operacionais que exigem dado no segundo exato (ex.: lista de mensagens do chat aberto, assumir atendimento, fila de handoff) **continuam lendo das tabelas transacionais** — apenas agregações analíticas vão para MVs.

#### Parte B — Desacoplamento do `AppContext.tsx` e Cache com React Query
- **Arquivos alvo:**
  - `src/contexts/AppContext.tsx` (`1.372` linhas)
  - `src/services/dashboard.service.ts`
  - `src/services/campaigns.service.ts`
  - `src/pages/Conversations.tsx`
- **Refatoração incremental (sem reescrever a UI):**
  1. **Atualização cirúrgica no Realtime de Conversas:**
     - Em vez de `convChannel` e `msgChannel` chamarem `debouncedRefresh()` (que recarrega até 300 conversas do banco), buscar apenas a conversa alterada via `api.getConversationById(convId)` (ou atualizar o objeto em memória com `payload.new`) e fazer merge no array `conversations` do estado.
     - Manter o som de notificação e o contador de não lidas (`unreadCount`) intactos para mensagens `inbound` / `sender_type === 'user'` atribuídas ao operador ou fixadas (`pinned`).
  2. **Remover `leadsChannel` global do `AppContext.tsx`:**
     - Assinar mudanças de `agent_leads` **apenas** quando o usuário estiver montado nas telas que realmente precisam (`SalesCockpit` / `CampaignDetail`), evitando que disparos em massa acordem quem está apenas atendendo no chat.
  3. **Cache inteligente no Dashboard (`@tanstack/react-query`):**
     - Configurar `staleTime: 60_000` (1 min) e `refetchOnWindowFocus: false` nas queries de Dashboard e listagem de Campanhas, com botão explícito de "Atualizar" quando o operador quiser forçar leitura imediata.
  4. **Validação:** `npx tsc --noEmit`, `npm run build`, e teste manual de envio/recebimento de mensagem no chat com som, contador de não lidas, pin e abertura do Dashboard.

---

## 5. ITEM 3 — Isolamento na VPS Netcup (`Worker + Redis`) e Desacoplamento do Roteador do n8n

### 5.1 Especificação de Negócio
- **Por que fazer:**
  1. Durante disparos de 10.000 mensagens, a Zenvia devolve ~30.000 webhooks de status (`SENT`, `DELIVERED`, `READ`) em rajadas. Mesmo com a função SQL otimizada na Fase 1, 30.000 chamadas HTTP simultâneas ao Supabase consomem conexões, geram pico de WAL e competem com operadores reais.
  2. Toda a inteligência comercial da Sofia está em `docs/ROTEADOR_DE_CONTEXTO_COMPLETO.js` (`2.815` linhas) colada manualmente num node JS do n8n. Qualquer ajuste exige copy-paste manual, não tem suíte de testes automatizados e pode derrubar o atendimento com um erro de sintaxe em produção (como já ocorreu com `Unexpected token 'catch'`).
  3. Você já paga por uma VPS Netcup com **`8 vCPUs` e `16 GB RAM`** praticamente ociosa.
- **Resultado esperado para o negócio:**
  - Disparos de 10k–50k mensagens com **impacto praticamente zero** no banco de dados e na experiência do operador.
  - Evolução segura do agente comercial (Sofia/Fiserv): todo ajuste passa por Git + testes automatizados antes de ir a produção, sem copy-paste manual no n8n.

### 5.2 Especificação Técnica

#### Parte A — Buffer de Webhooks Zenvia e Disparos com Redis + BullMQ na VPS Netcup
- **Arquitetura alvo (rodando em Docker Compose na VPS Netcup `RS 2000 G12`):**
  ```
  Zenvia Webhooks (SENT/DELIVERED/READ)
        │
        ▼
  Porteiro / Webhook Receiver (Netcup - resposta 200 OK em < 5ms)
        │
        ▼
  Redis (fila em memória na Netcup)
        │
        ▼
  Batch Flusher Worker (a cada 3–5 segundos ou a cada 200 eventos)
        │
        ▼
  1 única RPC em lote no Supabase:
  public.handle_message_status_batch(p_events jsonb)
  ```
- **O que construir:**
  1. **Migration SQL:** `database/migrations/YYYYMMDD_handle_message_status_batch.sql` criando a RPC `public.handle_message_status_batch(p_events jsonb)` que recebe um array JSON de até 500 eventos de status e faz:
     - `INSERT INTO message_status_history` em lote (`jsonb_to_recordset`)
     - `UPDATE messages` em lote (`FROM ...`)
     - `UPDATE outbound_queue` em lote (`WHERE (metadata->>'message_id') = ...`)
     - 1 único `fn_sync_campaign_stats` por `campaign_id` distinto presente no lote.
     - **Impacto:** 300 webhooks viram **1 transação** em vez de 300 (**-99% conexões e locks**).
  2. **Serviço Worker na Netcup (Node.js + Redis + BullMQ):**
     - **Fila `zenvia-status-buffer`:** acumula eventos de status e chama `handle_message_status_batch` a cada 5s.
     - **Fila `campaign-dispatcher`:** consome disparos de campanha com rate-limiting configurável (ex.: 25 msgs/seg), retry exponencial para HTTP 429/5xx da Zenvia e gravação em lote no Supabase.
  3. **Observabilidade:** logs estruturados JSON + endpoint `/health` monitorando tamanho das filas Redis e taxa de erro.

#### Parte B — Migração do `ROTEADOR_DE_CONTEXTO_COMPLETO.js` para Microserviço Versionado na Netcup
- **Arquitetura alvo:**
  - **n8n continua como orquestrador visual** (recebe webhook do Porteiro, chama LLM, chama Fiserv, envia Zenvia).
  - O node **`Roteador de Contexto`** (hoje com 2.815 linhas de JS) é substituído por **1 único HTTP Request node** apontando para `http://davos-router:3001/route` (rede interna Docker na própria VPS Netcup, latência `< 2 ms`).
- **Estrutura do microserviço (`services/davos-router/`):**
  - `src/router.ts`: lógica modularizada em arquivos pequenos e testáveis:
    - `parsers/money.ts` (parse de valores, trava mínima de R$ 10.000, preservação de `original_requested_amount`)
    - `filters/autoReply.ts` (detecção de robôs/cardápios/ausências)
    - `stateMachine/transitions.ts` (transições de `start` → `coleta_valor` → `criar_lead` → `apresenta_ofertas` → `solicitar_simulacao` → `confirmacao_cliente`)
    - `prompts/builder.ts` (montagem do prompt e `interactive_buttons`)
  - `tests/router.spec.ts` (Vitest): suíte de testes de regressão cobrindo todos os cenários reais já vistos em produção:
    - Valor abaixo do mínimo (`2000`, `3000`, `5000`) no Flow e na Nova Simulação → sobe para `10000` e preserva `original_requested_amount`.
    - `amount: "0"` com `status: "approved"` (caso Embaixador) → não libera simulação com limite zero.
    - Auto-respostas/robôs (cardápio Arandela, `"Esta mensagem é automatica"`, `"DIGITE SEU PEDIDO"`, loja fechada) → `stop_flow: true`, `is_auto_reply: true`.
    - Fluxo `#reset` → `"oi"` → `"sim"` → WhatsApp Flow.
    - Dúvidas institucionais Ticket (`4004-2233`), desistência e CNPJ divergente.
- **Plano de Rollout Seguro (Shadow Mode):**
  1. Subir `davos-router` na Netcup em paralelo com o node JS atual.
  2. Rodar testes unitários + replay de 100 conversas reais do dia comparando 100% das saídas (`currentStep`, `requested_amount`, `forced_text`, `stop_flow`).
  3. Trocar o node no n8n pelo HTTP Request mantendo o node antigo desativado como fallback imediato de 1 clique por 7 dias.

---

## 6. Ordem de Execução & Checklist de Validação

| Ordem | Frente | Risco | Dependência | Critério de Pronto (DoD) |
|---|---|---|---|---|
| **1** | Upgrade Supabase para `MEDIUM` (madrugada) | Baixo (restart 1–2 min) | Nenhuma | Instância `MEDIUM` online (`4 GB RAM`) |
| **2** | Item 1A — Retenção automática (`pg_cron`) + limpeza de bloat | Baixo | Janela de madrugada | Banco `< 2.5 GB`, job semanal ativo em `cron.job` |
| **3** | Item 1B — Otimização `get_sales_cockpit_leads` | Baixo | Gabarito de regressão | Mesma saída exata, `EXPLAIN ANALYZE < 300 ms` |
| **4** | Item 2A — Materialized Views do Dashboard | Baixo | Nenhuma | `REFRESH CONCURRENTLY` ativo, Dashboard `< 100 ms` |
| **5** | Item 2B — Desacoplamento `AppContext.tsx` + React Query | Médio | Testes de chat/som/pin | Zero refetch global em disparo; `tsc` e `build` verdes |
| **6** | Item 3A — Worker + Redis na Netcup (`handle_message_status_batch`) | Médio | Docker Compose Netcup | Webhooks Zenvia gravando em lote a cada 5s |
| **7** | Item 3B — Microserviço `davos-router` na Netcup | Médio | Suíte Vitest + Shadow Mode | 100% dos testes passando + n8n chamando `/route` |
