# 📉 Nexus Hub: Technical Debt Ledger

> **Meta-Goal**: Track complex architectural refactors or highly specific system optimizations that have been intentionally deferred so that the team can maintain delivery velocity in the short term.
>
> **When to address these**: During cooling-off periods (Q3/Q4), dedicated tech-debt sprints, or when a specific module suffers critical performance/maintainability friction in production.

---

## 1. Frontend: Migração para `@tanstack/react-query`
- **Categoria**: Performance Frontend & Network Optimization
- **Impacto**: Médio-Alto (UX)
- **Status**: ⏳ Deferred (Fevereiro 2026)
- **Motivo do Adiamento**: O backend via Supabase RPCs (queries otimizadas como `get_companies_overview` e `get_agents`) já derrubou a latência drástica do banco de dados para ~200ms. A atual duplicação de requests dos vários `useEffect` nos componentes isolados causa waterfalls pequenos no navegador, mas não trava os trilhos TCP da aplicação e o usuário não sente a página pendurando excessivamente. Tida como "Over-engineering" no atual estágio MVC.
- **Plano de Solução**: 
  1. Instalar `@tanstack/react-query`.
  2. Acoplar um `QueryClientProvider` global na `App.tsx`.
  3. Refatorar cada requisição estática (`api.companies.getAll`, `api.plans.getAll`) nos custom hooks para utilizar `useQuery`, com tempo de Stale Time elevado para evitar refetching em troca de rotas.
  4. Deletar todos os sub-estados gerenciadores isolados (`isLoading`, `error`, `data`) que hoje estão nos arquivos `*.tsx`.

## 2. Padrão Estrutural de Canais dos Agentes (Channels Standardization)
- **Categoria**: Arquitetura & Manutenibilidade de Integração
- **Impacto**: Médio (Developer Experience / Escala de Negócio)
- **Status**: ⏳ Deferred
- **Motivo do Adiamento**: Foi levantado o desarranjo nos objetos de configuração que armazenam "Canais" por onde os agentes rodam (WhatsAppEvolution, N8N, ChatWeb, VAPI). O ecossistema roda hoje funcionalmente com chaves variadas nos metadados, mas a longo prazo dificultará o mapeamento de logs e criação de novas pontes na plataforma Omni-channel de IA. O tempo de normalizar todas as tabelas pararia os testes integrados correntes.
- **Plano de Solução**:
  1. Definir uma tipagem ou enum estrito no modelo DB para os canais permitidos (`channels: 'WHATSAPP_EVO' | 'WEB_WIDGET' | 'VAPI_VOICE' | 'REST_API_N8N'`).
  2. Implementar uma camada adaptadora única (Strategy Pattern) no backend do bot para que as requisições de RAG lidem com canais uniformemente.
  3. Atualizar o frontend (`AgentDetails.tsx`) para processar e renderizar botões de conexão de forma automatizada via loop com base na prop `channel.type`, reduzindo os cases manuais de React.

---

---

## 3. Platform Evolution: Roadmap de Blindagem (Q1/Q2 2026)
> **Alinhamento Multi-Agente**: Sequência baseada nas recomendações de `@[product-owner]`, `@[backend-specialist]` e `@[frontend-specialist]`.

### Faixa 1: Estabilidade & Performance (Blindagem de Código)
- **Perspectiva**: `@[frontend-specialist]` (Prevenção de Regressões).
- **Ações**:
  1. **Tipagem Automática (Schema-First)**: Bloquear o build se o frontend desviar do banco.
  2. **Playwright Visual Core**: Criar screenshots "North Star" das telas de Dashboard e Conversas.
  3. **Master RPC (`get_dashboard_summary`)**: Reduzir 20+ chamadas para 1.

### Faixa 2: Segurança & Compliance (Mascaramento)
- **Perspectiva**: `@[backend-specialist]` (Security-First) & `@[product-owner]` (Legal).
- **Ações**:
  1. **Postgres Masking Function**: Regras de Regex movidas da camada UI para a camada SQL.
  2. **View `secure_messages`**: Filtro obrigatório para usuários com perfil `operador`.
  3. **DPO Override**: Liberação de visualização de PII apenas mediante Role específica.

### Faixa 3: UX Operacional & Valor (Real-time Handoff)
- **Perspectiva**: `@[product-owner]` (Valor de Negócio) & `Architect` (Realtime).
- **Ações**:
  1. **Supabase Realtime**: Ativar WebSocket na tabela `conversations`.
  2. **IA Attention Logic**: Flag `needs_attention` disparado pela IA (N8N) quando o sentimento cai abaixo de -0.7.
  3. **Visual Alert**: "Dashboard Pulsante" para notificações críticas sem Refresh.

## 4. Nexus Hub Architecture v3.0: High-Performance Orchestration & Identity Persistence
- **Categoria**: Performance, Segurança (ISO 42001) & Escalabilidade
- **Impacto**: Crítico (Latência: -50%, Segurança: Cross-Conversation)
- **Status**: ⏳ Deferred (Março 2026)
- **Motivo do Adiamento**: O sistema atual (`n8n_orchestrator_v4`) é estável e atende bem à demanda presente (~1.4s de latência). Migrar para a v3 envolve mudanças profundas na estrutura de sessões (de UUID de conversa para Identificador de Usuário) e na lógica de orquestração do n8n. Dada a criticidade do fluxo de WhatsApp em produção, a mudança foi adiada para evitar riscos de regressão imediata. Prevalência da estabilidade sobre a otimização extrema.
- **Plano de Solução (Plano de 4 Fases)**:
  1. **Fase 1: "Single Shot" RPC & Identidade Global**: Implementar a RPC `orchestrate_ai_conversation_v5` unificando RAG (Knowledge + Memories), Histórico e Segurança em uma única chamada. Migrar a tabela `conversation_security_sessions` para ser baseada em `(tenant_id, user_identifier, agent_id)`, permitindo persistência de login entre diferentes janelas de conversa.
  2. **Fase 2: Hardening de Segurança & n8n**: Eliminar o uso de `apikey` estática no workflow n8n (migrar para Credenciais nativas) e implementar filtros de *Prompt Injection* no input do usuário antes do processamento pela IA.
  3. **Fase 3: Billing de Uso Real (Real-time Usage)**: Sincronizar o registro de consumo (`record_usage`) com o objeto `usage` retornado pela OpenAI/Anthropic, abandonando a estimativa fixa por mensagem para tokens reais.
  4. **Fase 4: Paralelismo no n8n**: Reestruturar o workflow para executar gerações de embeddings e checagens de governança em nós paralelos, reduzindo caminhos seqüenciais desnecessários.

---

*(Append items here as the system scales and edges cases are consciously dropped in favor of release deadlines).*
