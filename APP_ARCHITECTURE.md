# Agent Nexus Hub - Documentação da Arquitetura (Completa & Detalhada)
> **Última Atualização:** 11/Fev/2026
> **Versão:** 6.0 (Master Orchestrator & Multimedia Support)
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

### 2.1 Detalhamento da Stack

| Camada | Componente | Tecnologia | Papel & Detalhes Técnicos |
| :--- | :--- | :--- | :--- |
| **Frontend** | UI Framework | **React 18 (TypeScript)** | Single Page Application (SPA). Tipagem rigorosa para contratos de API. |
| | Tooling | **Vite** | Build system ultrarápido e HMR. |
| | Estilo | **Tailwind CSS + Shadcn/UI** | Design System atômico baseado em Radix UI primitives. |
| | Service Layer | **AuthService / ApiService** | Camada de abstração que centraliza lógica de negócios e chamadas RPC. |
| | Estado | **Context API + Local State** | Gerenciamento de sessão e dados voláteis. |
| **Backend** | **Lógica (Core)** | **PL/pgSQL (PostgreSQL)** | Funções via RPC. O backend é *Database-First*. Lógica atômica e segura via RLS. |
| | Camada API | **PostgREST (Supabase)** | Exposição automática e segura das tabelas e RPCs via RESTful API. |
| | Autenticação | **Supabase Auth + Custom Users** | Auth V2: O Supabase gerencia sessão (JWT), mas a tabela `public.users` gerencia permissões, roles e tenants. |
| **Persistência** | Banco de Dados | **PostgreSQL 15+** | Relacional puro com suporte extensivo a JSONB para metadados de IA. `pgvector` para Embeddings. |
| | Armazenamento | **Supabase Storage** | Gestão de arquivos (áudios de conversas, assets da empresa, documentos RAG). |
| **Orquestração** | Middleware IA | **n8n (Self-Hosted)** | Motor de fluxos. Atua como o executor stateless que liga o banco às LLMs. |
| | Conectividade | **Webhooks / REST** | Integração com WhatsApp (Evolution API), Vapi, Retell e CRMs externos. |
| **Inference** | Modelos LLM | **OpenAI / Anthropic** | Modelos (GPT-4o, Claude 3.5 Sonnet) orquestrados exclusivamente pelo n8n. |

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

## 9. Inteligência de Leads (CRM)

### 9.1 Qualificação Automática
Conversas auditadas geram Score.
-   **Score >= 80:** Lead Quente 🔥 (Tags automáticas aplicadas).
-   **Visualização Kanban:** `/lead-crm` organiza contatos por estágio de funil, movidos automaticamente pela IA ou manualmente.

---

> **Fim da Documentação**
