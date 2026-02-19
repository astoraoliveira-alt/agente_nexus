# Agent Nexus Hub - Documentação da Arquitetura (Completa & Detalhada)
> **Última Atualização:** 19/Fev/2026
> **Versão:** 7.0 (Positive Reinforcement & Campaign Manager)
> **Status:** Mestre (Fonte Única da Verdade)
> **Fonte Primária:** `database/schema.sql`

---

## 1. Visão Geral e Estratégia de Produto

**Davos Nexus** é uma plataforma SaaS Enterprise ("AI Control Tower") projetada para orquestração, monitoramento seguro e governança de agentes de IA em escala.

### 1.1 Missão do Sistema
Resolver a fragmentação do uso de IA corporativa, oferecendo um ponto único para gerenciar IAs que operam no WhatsApp, Telefonia (Voz) e Web, garantindo compliance (ISO 42001 e LGPD) e controle financeiro.

### 1.2 Arquitetura Multi-Tenant
O sistema opera sob isolamento estrito de dados (Row Level Security - RLS).
- **Tenant (Empresa):** A unidade atômica de isolamento. Todos os queries SQL filtram por `tenant_id`.
- **Hierarquia de Usuários:**
  - **Super Admin (Davos):** Visão global, capacidade de "impersonate" (entrar em tenants).
  - **Tenant Admin:** Gestão total do ambiente da sua empresa.
  - **Operador:** Focado em atendimento humano (HITL - Human in the Loop).
  - **Visualizador:** Apenas leitura de dashboards.

---

## 2. Stack Tecnológico & Arquitetura de Camadas

A arquitetura do Nexus Hub evoluiu para um modelo híbrido **Service-Oriented Frontend + Database-First Backend**.

### 2.1 Detalhamento da Stack (Híbrida & Distribuída)

O sistema opera em uma arquitetura **Geo-Distribuída**, otimizada para latência no Brasil (para dados sensíveis) e performance global (para IA/Voz).

| Camada | Componente | Tecnologia | Localização (Infra) | Papel & Detalhes Técnicos |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend** | UI App | **React 18 (Vite)** | 🇺🇸 Vercel (USA) | SPA estático. CDN global, mas origem nos EUA. |
| **Backend** | Database | **PostgreSQL 15+** | 🇧🇷 Supabase (Brasil) | Core do sistema. Dados sensíveis (LGPD) residem no Brasil. |
| | API Layer | **PostgREST** | 🇧🇷 Supabase (Brasil) | Exposição automática e segura do DB via REST. |
| | Serv. Functions | **Deno / Node.js** | 🇧🇷 Supabase Edge | Funções serverless para webhooks e integrações leves. |
| | Auth | **Supabase Auth** | 🇧🇷 Supabase | Gestão de sessão JWT. |
| **Orquestração** | Workflow Engine | **n8n (Node.js)** | 🇧🇷 Hostgator (BR)* | *A confirmar.* Motor de fluxos que orquestra a lógica de IA. |
| **Canais** | WhatsApp | **Evolution API (Node)** | 🇧🇷 VPS (Brasil) | Gateway de mensagem. Node.js rodando em VPS dedicada. |
| | Voz | **VAPI / Twilio** | 🇺🇸 USA (Global) | O processamento de voz ocorre nos EUA (menor latência p/ LLMs). |
| **Inference** | LLM Brain | **OpenAI / Anthropic** | 🇺🇸 USA | Modelos de raciocínio (GPT-4o, Claude 3.5). |

### 2.2 Latência & Estratégia de Rede
Dada a distribuição geográfica, a latência é um fator crítico monitorado pela **Central de Latência (System Status)**:
- **User -> Frontend (Vercel):** ~100-150ms (Carregamento inicial).
- **User -> Database (Supabase BR):** <50ms (Operações CRUD rápidas).
- **Supabase -> N8N (BR):** <30ms (Baixa latência para gatilhos).
- **Supabase -> LLM (USA):** ~400-800ms (Gargalo natural da IA).

Esta arquitetura híbrida garante que os dados do cliente fiquem no Brasil (Compliance), enquanto aproveitamos a melhor infraestrutura global para IA.

### 2.2 O Paradigma "Database-First" com Service Layer
- **O Banco é o Backend:** Toda validação de permissão crítica, cálculos de billing e integridade de dados ocorre em **PL/pgSQL**.
- **Service Layer no Frontend:** Para evitar duplicação e espaguete de código, o frontend agora usa classes de serviço (`src/services/`) para encapsular chamadas complexas ao Supabase, como o fluxo de login híbrido ou operações de auditoria.
- **Segurança Nativa:** O isolamento multi-tenant é garantido por **RLS (Row Level Security)**, impossibilitando que um tenant acesse dados de outro, mesmo em caso de erro no frontend.

---

## 3. Auth V2 & RBAC (Database Agnostic)

Implementamos um sistema de autorização desacoplado do provedor de identidade (Supabase Auth), permitindo maior controle e portabilidade.

### 3.1 Tabela `public.users` (Fonte da Verdade)
A tabela `auth.users` (Supabase) gerencia apenas credenciais e sessões. A tabela `public.users` gerencia o negócio:
- **`id`**: UUID próprio (não necessariamente igual ao auth.uid).
- **`provider_id`**: O elo de ligação com o Supabase Auth.
- **`status`**: `pending` (aguardando aprovação), `active` (liberado), `blocked` (banido), `invited` (convite pendente).
- **`role`**: `super_admin`, `tenant_admin`, `operator`, `viewer`.
- **`tenant_id`**: Isolamento estrito.

### 3.2 Fluxo de Login Híbrido (`AuthService`)
1.  **Frontend:** Usuário faz login via Supabase Auth.
2.  **Verificação:** `AuthService` intercepta o sucesso e consulta `public.users` usando o ID retornado.
3.  **Validação de Status:**
    -   Se `status == pending` -> Redireciona para tela de "Aguardando Aprovação".
    -   Se `status == blocked` -> Força logout imediato.
    -   Se `status == active` -> Carrega Tenant e libera acesso.
4.  **Auto-Link:** Se o usuário existe no Auth mas não no Public (ou vice-versa), o sistema tenta vincular automaticamente por email (útil para convites).

### 3.3 Fluxo de Aprovação (Admin UI)
-   Novos cadastros entram como `pending`.
-   **Super Admin** visualiza lista de pendentes em `/users` (aba exclusiva).
-   Ação de **Aprovar**: Define `tenant_id` e `role`. Muda status para `active`.
-   Ação de **Rejeitar**: Bloqueia o acesso.

---

## 4. Governança de Agentes & Knowledge Base (RAG)

### 4.1 Knowledge Base (RAG Gerenciado)
O sistema agora suporta RAG (Retrieval-Augmented Generation) nativo por agente.
-   **Tabela `agent_knowledge`**: Armazena fragmentos de conhecimento.
-   **Embeddings**: Supabase `pgvector` armazena vetores semânticos.
-   **Vinculação**: Relação N:1 com `agents`. Um documento pertence a um agente específico.
-   **Fluxo N8N**: O RPC `get_agent_context` agora retorna automaticamente os snippets de conhecimento mais relevantes para a query do usuário, injetando no Contexto do Agente.

### 4.2 RAG de Reforço Positivo ("Success Memory")
Além do conhecimento estático (PDFs), o sistema agora possui **aprendizado contínuo** com base no feedback das conversas (notas 4 e 5).

1.  **Captura (Batch Job):** Um fluxo diário no N8N:
    -   Busca conversas recentes com *Score >= 75*.
    -   Usa LLM para analisar *por que* deu certo (estratégia).
    -   Sanitiza PII (Remove nomes/telefones).
    -   Gera embeddings e salva na tabela `agent_success_memory`.
2.  **Recuperação (Híbrida no Chat):**
    -   Antes de chamar o AI Agent, o fluxo gera embedding da pergunta atual.
    -   Consulta `match_success_memory_as_system` para achar estratégias similares.
    -   Injeta no System Prompt: *"Em situações similares, funcionou bem fazer X, Y, Z"*.
3.  **Resultado:** O Agente "imita" seus melhores momentos, criando um flywheel de qualidade.

### 4.2 Agentes como Unidade de Governança (ISO 42001)
Na arquitetura do Nexus, um **Agente** é um Ativo Corporativo sujeito a auditoria.

1.  **`risk_level`** (`low`, `medium`, `high`, `critical`): Agentes de alto risco exigem aprovação humana.
2.  **`lifecycle_stage`**: `development` -> `validation` -> `production` -> `retired`.
3.  **`brain_config` (JSONB)**: Contém System Prompt, Modelo, Temperatura e agora **`user_prompt_template`** (para motores burros/N8N).
4.  **Enforcement de Governança (Master RPC)**: Toda validação de status (`active`), limites de concorrência e estágio de ciclo de vida é centralizada na RPC `n8n_orchestrator`, impedindo que o n8n processe mensagens para agentes inativos ou empresas suspensas.

---

## 5. Ciclo de Vida da Conversa & Voice AI

### 5.1 Evolução de Estados
-   **`ai_active`**: N8N processa via LLM.
-   **`human_active`**: Operador assume. N8N pára.
-   **`closed`**: Finalizada.
-   *Auditoria de Qualidade:* Conversas fechadas entram em fila de auditoria (`Quality.tsx`) para avaliação humana, alimentando o score do agente.

### 5.2 Integração de Voz (VAPI) - Idempotência
A integração de voz é assíncrona e segura.
1.  **Webhook VAPI:** Envia payload completo ao fim da chamada.
2.  **RPC `sync_vapi_call`:**
    -   Grava payload bruto em `integration_logs` (Não-repúdio).
    -   Usa chave composta `(conversation_id, external_order)` para evitar duplicidade.
    -   Calcula custo baseado na duração (`startedAt` - `endedAt`).
    -   Sincroniza mensagens na tabela `messages` via RPC robusta.

### 5.3 Suporte Multimídia & RLS Bypass
O sistema utiliza a RPC **`record_message`** para gravação segura de interações:
- **Resiliência:** Bypassa as restrições de RLS para o n8n (usando `service_role`), permitindo gravação em tenants isolados.
- **Multimídia:** Suporte nativo para `audio_url`, `image_url` e `video_url`.
- **HITL:** Registra transcrições automáticas de áudio para auditoria imediata.
- **Atividade:** Atualiza automaticamente o `last_message_at` da conversa para gestão de inatividade.

---

## 6. Privacidade & LGPD (Data Masking)

Implementação de Privacy-by-Design no Frontend.

### 6.1 Camada de Mascaramento (`masking.ts`)
-   **Detecção de Padrões:** Regex para CPF, CNPJ, Email, Telefone, Cartão de Crédito.
-   **Aplicação:** O mascaramento ocorre **no Frontend** antes da renderização em componentes sensíveis (`ChatArea`, `WhatsAppView`, `ContactList`).
-   **Persistência:** O dado no banco permanece original (para fins legais), mas a visualização padrão é ofuscada (ex: `***.***.123-**`).
-   **Controle:** Toggle no `Settings` ou `Context` permite que operadores autorizados revelem dados temporariamente (auditado).

---

## 7. Consumo Financeiro & Billing

### 7.1 Eventos Geradores de Custo
1.  **Tokens (LLM):** Reportados pelo N8N.
2.  **Mensagens (WhatsApp):** Custo unitário por mensagem.
3.  **Voz (Minutos):** VAPI/Retell billing.

### 7.2 Fluxo Financeiro
1.  **Registro:** RPC `record_usage` grava métricas brutas.
2.  **Precificação:** Tabela `plans` define custos unitários por Tenant.
3.  **Visualização:** Dashboard Financeiro calcula `quantidade * custo_unitario` em tempo real.
4.  **Reporting:** Relatórios agregados por Centro de Custo (Tenant) ou Agente.

---

## 8. Integração N8N (Contrato V3 - Master Orchestrator)

O N8N atua como "Motor Burro" (Dumb Engine) de alta performance.

### 8.1 Consolidação de Performance
Evoluímos de múltiplas chamadas sequenciais para uma arquitetura baseada em **Master RPCs**:
1.  **Lookup & Governança:** O nó inicial chama `n8n_orchestrator_v3`, que em uma única transação:
    - Identifica Agente pela instância (Evolution API).
    - Valida status da Empresa e do Agente.
    - Verifica limites de concorrência.
    - Gerencia (Abre/Reabre) a Conversa.
    - Sincroniza Contato (Unicidade por `tenant_id`).
    - Retorna Contexto completo (Prompt + Histórico + Knowledge).
2.  **Gravação Segura:** O nó final utiliza `record_message` para persistência, garantindo integridade e conformidade com RLS.

---

## 9. Inteligência de Leads & Campanhas (CRM V2)

### 9.1 Campanhas de Outbound (Disparos em Massa)
Novo módulo para gestão de listas de transmissão e reativação.

1.  **Importação Inteligente:** Suporte a `.csv`, `.xls`, `.xlsx`. Detecta colunas de Nome/Telefone e deduplica automaticamente contatos existentes.
2.  **Fila de Disparo (`campaign_tracking`):**
    -   Cada contato vira um item na fila com status (`pending`, `sent`, `failed`).
    -   Trigger `trg_track_campaign_response` detecta respostas do usuário (Inbound) e marca conversão.
3.  **Atomicidade:**
    -   O n8n chama `handle_outbound_sent` (RPC) para garantir que um envio só seja marcado como sucesso se a mensagem realmente saiu.
    -   Rastreamento de falhas agregado (`failed_count`) visível no Dashboard.

### 9.2 Qualificação Automática (Score)
Conversas auditadas geram Score.
-   **Score >= 80:** Lead Quente 🔥 (Tags automáticas aplicadas).
-   **Visualização Kanban:** `/lead-crm` organiza contatos por estágio de funil, movidos automaticamente pela IA ou manualmente.

---

## 10. Monitoramento & Observabilidade (Central de Latência)

Para mitigar os riscos da arquitetura distribuída, implementamos um **Monitor de Latência em Tempo Real** (`/admin/system-status`).

### 10.1 Arquitetura de Ping Híbrido
O monitoramento não é passivo, ele executa testes ativos ("Pings") em duas direções:

1.  **Frontend Pings (User Perspective):**
    -   O navegador do usuário testa a latência até a Vercel (CDN) e Supabase (DB).
    -   Mede a qualidade da conexão do operador.

2.  **Backend Pings (Edge Function `check-health`):**
    -   Como o Supabase está no Brasil, ele atua como o "Ponto Central" de medição.
    -   A Edge Function dispara requisições leves (HEAD/GET) para:
        -   **N8N (BRL):** Valida a conectividade do orquestrador.
        -   **Evolution API (BRL):** Valida o gateway de WhatsApp.
        -   **OpenAI/VAPI (USA):** Mede o "custo de rede" internacional.

### 10.2 Indicadores de Saúde
-   🟢 **Saudável:** Latência dentro do esperado (<200ms BR, <800ms USA).
-   🟡 **Degradado:** Latência 50% acima da média.
-   🔴 **Offline:** Timeout ou Erro 5xx.

---


## 11. Modelo de Negócio & Interface (Business Logic & UI)

Esta seção detalha as regras de negócio, contadores de consumo e a definição de interface para o painel administrativo.

### 11.1. Arquitetura de Planos e Limites (SaaS)

O sistema opera com 3 modalidades de planos, definidos na tabela `companies` e `plans` (Catálogo).

| Tipo de Plano | Lógica de Cobrança | Exemplo de Uso |
| :--- | :--- | :--- |
| **Fixed (Quota)** | Valor fixo mensal com limites rígidos (hard limit). Excedente bloqueia ou requer upgrade. | PMEs, Planos de Entrada (Start). |
| **Flex (Pay-as-you-go)** | Mensalidade base + Custo por uso excedente. O valor da mensalidade pode reverter em crédito. | Enterprise, Operações de Alto Volume. |
| **Unlimited** | Valor fixo alto, sem limites práticos (apenas Fair Use policy). | Contratos Governamentais/Grandes Contas. |

#### Contadores de Consumo (Counters)
O sistema rastreia 4 métricas principais em `consumption_metrics`:

1.  **Tokens LLM:** Unidade de processamento de texto (Input + Output). Preço/1k.
2.  **Mensagens:** Contador de interações (independente do tamanho). Preço/unidade.
3.  **STT Minutes (Speech-to-Text):** Minutos de áudio transcritos (Ouvido pela IA).
4.  **TTS Minutes (Text-to-Speech):** Minutos de áudio gerados (Falado pela IA).

> **Nota de Governança (ROI):** O sistema calcula automaticamente o ROI baseado na fórmula:
> `Economia = (Total Mensagens * 2.5 min/human) * (Valor Hora Operador)`

---

### 11.2. Definição de Interface (Dashboards)

#### A. Dashboard Principal (`/dashboard`)
Visão geral tática para o gestor da operação.

| Componente (Card) | Descrição Técnica | Fonte de Dados |
| :--- | :--- | :--- |
| **Conversas Ativas** | Volume em tempo real de atendimentos não finalizados. | `conversations.status != 'closed'` |
| **Taxa de Automação** | % de conversas resolvidas sem intervenção humana. | `1 - (human_interventions / total)` |
| **Tempo Economizado (ROI)** | Estimativa de horas humanas poupadas pela IA. | `tokens * fator_economia` |
| **Consumo do Plano** | Progresso da barra de consumo (Tokens/Msgs) vs Limite. | `consumption_metrics` vs `companies.limits` |
| **Gestão de Incidentes** | Status de tickets (Abertos, Investigando, Resolvidos). | `incidents` table |
| **Qualidade (Trust Score)** | Média das avaliações de auditoria (0-100). | `evaluations.score` |
| **Base de Contatos** | Funil de Leads (Quente/SQL, Médio/MQL, Frio/Lead). | `contacts.lifecycle_status` |

#### B. Resumo Financeiro - DRE (`/financial`)
Visão executiva de lucratividade por Tenant (Visão Super Admin).

*   **Receita Total (Bruto):** Soma de Mensalidades Fixas + Variável (Excedente).
*   **Custos Operacionais (Interno):** Custo de Infra (Supabase/Vercel) + Consumo de APIs (OpenAI/Vapi).
*   **Margem Líquida:** `Receita - Custos`.
*   **Alertas:** KPI automático para margem < 20%.

#### C. Consumo Detalhado (`/consumption`)
Auditoria técnica de uso para faturamento.

*   **Saldo de Inteligência:** Visualização de Tokens gastos vs Contratados.
*   **Heatmap de Utilização:** Matriz de calor (Dia da Semana x Hora) para identificar picos de carga.
*   **Breakdown por Agente:** Custo individualizado por agente (quem gasta mais?).
*   **Breakdown por Canal:** Custo separado por WhatsApp, Web Chat e Voz.
*   **Predictor de Fatura:** Projeção linear de custo final baseada no consumo atual.

---

### 11.3. Governança e Controle de Fluxo

#### Handoff (Transbordo Humano)
O controle da conversa segue uma Máquina de Estados Finita (FSM) na tabela `conversations`.

1.  **AI_ACTIVE (Padrão):** IA responde automaticamente.
2.  **HUMAN_ACTIVE (Transbordo):**
    *   **Gatilho:** Intenção de "Falar com atendente", Erro crítico, ou comando manual `/assumir`.
    *   **Efeito:** IA silenciada (`is_paused=true`). Mensagens do usuário vão para o inbox do operador.
    *   **Interface:** O Chat muda de cor (Visual Indicator) e habilita input de texto para o humano.
3.  **CLOSED:** Conversa finalizada e arquivada.

#### Perfis de Acesso (RBAC) & ISO 42001
O sistema implementa papéis específicos para conformidade com IA Responsável:

*   **AI System Owner (Executivo):** Visão completa, aprovação de orçamento/planos.
*   **Risk Owner (Compliance):** Acesso a Incidentes, Auditoria e Logs. Não edita prompts.
*   **Operator (Humano):** Acesso apenas ao Chat (Inbox) para atendimento manual.
*   **Viewer:** Acesso somente leitura aos Dashboards.

#### Proteção de Dados (LGPD)
O sistema possui flag global `masking_enabled`. Quando ativo:
*   **Interface:** Mascara CPF, E-mail e Telefones no frontend (`***-**`).
*   **Banco de Dados:** Dados permanecem íntegros para processamento (transações).

