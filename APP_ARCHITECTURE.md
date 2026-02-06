# Agent Nexus Hub - Documentação da Arquitetura (Completa & Detalhada)
> **Última Atualização:** 04/Fev/2026/17:35
> **Versão:** 4.0 (Schema Alignment & N8N Contract)
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

A arquitetura elimina a camada tradicional de API Node.js (Middleware CRUD) em favor de um modelo **BaaS (Backend-as-a-Service)** com lógica no banco.

| Camada | Tecnologia | Detalhes Técnicos |
| :--- | :--- | :--- |
| **Frontend** | React 18 + Vite | SPA. Estado via TanStack Query. Interfaces via Shadcn/UI. |
| **Persistência** | PostgreSQL 15+ | Supabase (Hosted). Tabelas relacionais e JSONB. Single Source of Truth. |
| **Regras (Backend)** | PL/pgSQL RPCs | Funções atômicas para lógica crítica (Billing, CRM, Auth). |
| **Executor** | N8N (Self-Hosted) | Middleware Stateless. Conecta LLMs e Canais (WhatsApp/Retell). |
| **IA (Inference)** | OpenAI / Anthropic | Modelos LLM chamados exclusivamente pelo N8N. |

---

## 3. Alinhamento Documentação ↔ Banco de Dados

Referência direta às entidades do `database/schema.sql`.

### 3.1 Entidades Core (Tenancy & Acesso)
| Entidade (`table`) | Propósito Funcional | Governança & Relação |
| :--- | :--- | :--- |
| **`companies`** | O "Cliente". Raiz da hierarquia multi-tenant. | Contém as configurações globais de **Privacidade** (LGPD) e **Responsáveis** (ISO AI Owner, Risk Owner). |
| **`users`** | Acessos humanos à plataforma. | Estritamente vinculados a um `tenant_id`. Níveis de permissão definem visibilidade de menus. |
| **`policies`** | Regras de governança (ex: "Proibir menção a concorrentes"). | Atuam como **Guarda-Corpos (Guardrails)**. Podem ser vinculadas a múltiplos Agentes. |

### 3.2 Entidades Operacionais (O Motor)
| Entidade (`table`) | Propósito Funcional | Governança & Relação |
| :--- | :--- | :--- |
| **`agents`** | A unidade auditável de IA (O "Funcionário Digital"). | Possui **Risco** (`risk_level`), **Estágio** (`lifecycle_stage`) e **Configuração Cognitiva** (`brain_config`). É a entidade que gera custos. |
| **`flows`** | Contratos de jornada (ex: "Triagem", "Venda"). | Jornadas estruturadas. Diferente de um "Prompt solto", um fluxo tem **Objetivo** e **Critérios de Sucesso** auditáveis. |
| **`flow_stages`** | Etapas discretas do fluxo (Steps). | Define **quem atua** (`actor`: ai/human) e regras de **escalonamento** (ex: "Se falhar 3x, chame humano"). |
| **`conversations`** | Sessão de interação contínua. | Vincula `user` (cliente) ↔ `agent` (bot). Mantém o estado atual (`status`: ai_active/human_active). |
| **`messages`** | Log imutável da interação. | Registra o conteúdo (`content`), remetente (`sender_type`) e metadados ricos (áudio, transcrição). Base para auditoria. |

### 3.3 Entidades de Controle & Segurança
| Entidade (`table`) | Propósito Funcional | Governança & Relação |
| :--- | :--- | :--- |
| **`consumption_metrics`** | Registro financeiro granular. | Fonte da verdade para faturamento. Registra tokens e minutos de voz. **NÃO manipulável** pelo usuário. |
| **`audit_logs`** | Trilha de auditoria de segurança. | Quem mudou o que e quando (diff `before` -> `after`). Essencial para conformidade SOC2/ISO. |
| **`integration_logs`** | Auditoria técnica de integrações (Raw Payload). | Armazena o JSON bruto de chamadas batch (VAPI/Retell) para garantir rastreabilidade e debug de sincronização. |
| **`incidents`** | Registro de falhas de IA ou segurança. | Incidentes de alucinação ou vazamento de dados devem ser formalizados aqui para análise de risco. |

---

## 4. Agentes como Unidade de Governança (ISO 42001)

Na arquitetura do Nexus, um **Agente** não é apenas um prompt, é um Ativo Corporativo sujeito a auditoria.

### 4.1 Campos de Controle (Tabela `agents`)
Estes campos alteram o comportamento e a profundidade da supervisão exigida.

1.  **`risk_level`** (`low`, `medium`, `high`, `critical`):
    -   *Impacto:* Agentes de alto risco exigem aprovação humana para deploy (`lifecycle_stage`) e geram logs de auditoria mais detalhados.
2.  **`lifecycle_stage`** (Ciclo de Vida Formal):
    -   `development`: Sandbox. Só responde a números de teste.
    -   `validation`: Teste de carga e Red Teaming.
    -   `production`: Live para clientes finais.
    -   `retired`: Desativado, mantido apenas para histórico (Compliance).
3.  **`autonomy_level`** (1-5):
    -   Nível 1: Apenas responde perguntas (RAG).
    -   Nível 5: Executa ações no mundo real (API Calls) sem supervisão.

---

## 5. Ciclo de Vida da Conversa

A conversa é uma Máquina de Estados finita gerida pelo Banco de Dados.

### 5.1 Nascimento (Inbound)
1.  **Evento Externo:** Webhook do WhatsApp/Voz chega ao N8N.
2.  **Identificação:** N8N extrai telefone/email.
3.  **Resolução (RPC):** `get_or_create_conversation` busca uma sessão aberta.
    -   Se não houver, cria nova.
    -   Sincroniza dados do cliente na tabela `contacts`.

### 5.2 Evolução de Estados (`conversation_status`)
-   **`ai_active`**: Estado padrão. O N8N consulta o banco, vê esta flag e **processa** a mensagem com LLM.
-   **`human_active`**: Gatilho de **Intervenção Manual**.
    -   *Como ativa:* Regra de negócio (ex: cliente pede atendente) ou botão no Dashboard.
    -   *Efeito:* O N8N consulta o banco, vê esta flag e **interrompe** a execução automática. O operador assume via Chat UI.
-   **`closed`**: Conversa finalizada. Arquivada para histórico.

### 5.3 Memória e Histórico
- O N8N **não mantém estado**.
- A cada nova mensagem, ele busca o contexto chamando `get_agent_context` (RPC), que remonta o histórico recente da tabela `messages`.

---

## 6. Fluxos Conversacionais (Flows) – Operacional

`flows` e `flow_stages` não são apenas documentação, são contratos executáveis.

### 6.1 Estrutura do Contrato
-   **Flow:** Define o objetivo macro (ex: "Recuperação de Carrinho").
-   **Stages:** O passo-a-passo (1. Saudação -> 2. Oferta -> 3. Checkout).

### 6.2 Execução Híbrida
-   O banco armazena em qual estágio a conversa está (`current_stage_id` em `conversations`).
-   O estágio define o **Ator** (`actor`):
    -   `ai`: N8N processa.
    -   `human`: N8N transborda para fila humana.
    -   `both`: Copiloto (IA sugere, Humano aprova).
-   O N8N lê o estágio atual para saber qual Prompt ou Tool deve carregar.

---

## 7. Consumo e Billing (Financeiro)

O modelo de cobrança é desacoplado da execução técnica.

### 7.1 Eventos Geradores de Custo
1.  **Tokens (LLM):** Input + Output gerados na OpenAI/Anthropic.
2.  **Mensagens (Canal):** Custo de API do WhatsApp (Business API).
3.  **Voz (Minutos):** Tempo de processamento STT (Ouvir) e TTS (Falar).

### 7.2 Fluxo de Registro (Auditável)
1.  **Execução:** N8N realiza a chamada técnica (OpenAI API).
2.  **Reporte:** N8N extrai os metadados de uso (ex: `usage.total_tokens`).
3.  **Gravação Segura:** N8N chama RPC `record_usage` passando os valores.
4.  **Cálculo:** O banco grava os valores brutos. O cálculo financeiro (R$) ocorre na camada de aplicação (Dashboard) baseada no `plan_tier` da empresa no momento da consulta, ou pré-calculado na inserção dependendo da configuração.

> **Importante:** O N8N não sabe quanto custa um token. Ele apenas reporta "Gastei 150 tokens". A plataforma aplica a tabela de preços.

---

## 8. Segurança e Auditoria

### 8.1 Trilha de Auditoria (`audit_logs`)
Qualquer alteração crítica gera um registro imutável.
-   **O que é auditado:** Mudança de Prompt, Troca de Modelo de IA, Alteração de Plano, Acesso de "Impersonation".
-   **Detalhes:** Armazena o JSON `state_before` e `state_after` para diff.

### 8.2 Gestão de Incidentes
Se uma IA alucinar ou violar uma política:
1.  Operador reporta na UI ou sistema detecta anomalia.
2.  Cria-se registro em `incidents`.
3.  Afeta o `risk_score` do agente.
4.  Dispara alertas para o `Risk Owner` (ISO Accountability).

---

## 9. Contrato de Integração N8N (Formal)

O N8N é um executor "burro" e stateless.

### 9.1 ✅ O que o N8N DEVE fazer
1.  **Receber Eventos:** Webhooks de canais externos.
2.  **Pedir Contexto:** Chamar `POST /rpc/get_agent_context` para saber como agir.
3.  **Executar IA:** Chamar a API da OpenAI/Anthropic com o prompt recebido do banco.
4.  **Reportar:** Salvar a mensagem (`append_message`) e o consumo (`record_usage`).

### 9.2 ❌ O que o N8N NÃO DEVE fazer
1.  **Armazenar Prompts:** O "System Prompt" NUNCA deve ser hardcoded no nó do N8N. Deve vir do banco.
2.  **Decidir Preços:** Não calcular custos no fluxo.
3.  **Manter Estado:** Não usar variáveis globais do N8N para memória de conversa. Usar o banco.
4.  **Acessar Tabelas Diretamente:** Não fazer `SELECT * FROM users`. Usar apenas as RPCs autorizadas.

### 9.3 Dados Trafegados
-   **N8N -> Nexus:** IDs (Tenant, Agent, User), Texto do Usuário, Metadados de Uso.
-   **Nexus -> N8N:** Prompt do Sistema, Histórico de Mensagens, Configuração de Voz.

---

## 10. Inteligência de Leads & CRM (Extensão Pro)

A plataforma evoluiu de um log de conversas para um CRM Inteligente que qualifica leads automaticamente.

### 10.1 Fluxo de Qualificação Automática
Sempre que uma conversa é auditada via `save_evaluation`, o sistema executa:
1.  **Mapeamento de Contato:** Localiza o `contact` via `user_identifier`.
2.  **Qualificação por Score:**
    *   **Score >= 80:** "Lead Quente" 🔥
    *   **Score >= 50:** "Interesse Médio" 💧
    *   **Outros:** "Interesse Baixo" 🌫️
3.  **Enriquecimento Híbrido:** Anexa as tags geradas pela IA (`p_tags`) diretamente ao perfil do contato.

### 10.2 Visualização Kanban (CRM Dashboard)
- **Interface:** Localizada em `/crm`, oferece uma visualização moderna em colunas baseada no `lifecycle_status`.
- **Dinâmica:** Cards interativos que mostram canais de origem, tags de interesse e data de ativação, facilitando a tomada de decisão comercial.

---
> **Fim da Documentação**

---

## 11. Integração de Voz (VAPI) & Auditoria Avançada

A integração de Voz introduz complexidade de sincronização e concorrência, resolvida via arquitetura **Idempotente** e **Stateless**.

### 11.1 Arquitetura de Sincronização (Webhook)
Diferente dos chats texto (que inserem mensagem a mensagem), a VAPI envia o histórico completo ao final da chamada.
*   **Trigger:** Webhook da VAPI bate no N8N ao final da chamada.
*   **RPC Blindada (`sync_vapi_call`):**
    1.  **Auditoria Raw:** Grava o payload JSON original na tabela `integration_logs` antes de qualquer processamento (Garantia de Não-Repúdio).
    2.  **Deduplicação (Idempotência):** Utiliza um índice `UNIQUE (conversation_id, external_order)` para garantir que mensagens repetidas sejam rejeitadas pelo banco, permitindo reenvios seguros.
    3.  **Resolução de Identidade:**
        *   Prioridade 1: ID fornecido pelo N8N (Formulário).
        *   Prioridade 2: Telefone (`customer.number`).
        *   fallback: `web-visitor-{id}`.
    4.  **Cálculo de Custo:** Calcula automaticamente `duration_seconds` baseado nos timestamps `startedAt` e `endedAt` do payload.

### 11.2 Padrão Multi-Trigger (N8N)
O fluxo N8N foi desenhado para ser assíncrono:
1.  **Fluxo A (Disparo):** Recebe dados do Formulário Web -> Inicia chamada VAPI -> Termina. (Envia `metadata` com dados do cliente).
2.  **Fluxo B (Retorno):** Recebe Webhook da VAPI -> Lê `metadata` devolvido -> Sincroniza via RPC.
*   **Benefício:** Os fluxos são independentes e não exigem que o N8N fique "esperando" (memória presa) durante a duração da chamada.

---

## 12. Interface de Conversação & Métricas em Tempo Real

A interface foi evoluída para fornecer métricas visuais imediatas sobre o volume de interações, tanto no nível macro (Lista) quanto micro (Chat Ativo).

### 12.1 Contadores de Volumetria (UX Decision)
Para apoiar a tomada de decisão rápida dos operadores, foram implementados indicadores visuais de densidade de conversa:

1.  **Totalizador Agregado (Conversation List):**
    *   **Localização:** Cabeçalho da lista de conversas.
    *   **Lógica:** Cálculo dinâmico no frontend (`filteredConversations.reduce`) que soma o total de mensagens de todas as conversas atualmente visíveis no filtro.
    *   **Propósito:** Permitir que o supervisor entenda a "carga" de atendimento do filtro atual (ex: "Quantas mensagens o Agente de Vendas trocou hoje?").
    *   **Visual:** Ícone `MessageSquare` + Badge preto (`text-black`) para distinção visual clara contra o contador de threads.

2.  **Contador Contextual (Chat Header):**
    *   **Localização:** Topo da área de chat ativa.
    *   **Lógica:** `conversation.messages.length`.
    *   **Propósito:** Indicador rápido da extensão do diálogo atual, útil para estimar custos e complexidade da conversa antes mesmo de ler o histórico.
