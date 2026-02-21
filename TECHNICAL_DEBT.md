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

---

*(Append items here as the system scales and edges cases are consciously dropped in favor of release deadlines).*
