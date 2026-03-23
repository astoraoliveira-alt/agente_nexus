# Arquitetura Operacional do Nexus (Runtime & Mensageria)
*O contrato definitivo para transformar automações enraizadas no N8N em um robusto pipeline transacional de IA com telemetria, idempotência e observabilidade de nível corporativo.*

---

## 🟢 FASE 1: Telemetria Rica e Desacoplamento Financeiro
**Objetivo:** Transformar o sistema em algo agnóstico de preço (burro), porém absurdamente rico em dados (telemetria) para analytics dinâmico. O faturamento estrito fica 100% no Supabase.

### ✅ Ticket 1.1: Trancar Chaves no Cofre do N8N (Segurança Base)
- **Status:** CONCLUÍDO.
- Eliminar o texto plano do node `Origem Requisicao` utilizando variáveis ambientais ou credenciais nativas seguras.

### ✅ Ticket 1.2: O Evento Canônico de Uso (Billing & Idempotência)
- **Status:** CONCLUÍDO.
- Matemática de Dólares/Reais removida do N8N.
- Envio do Evento de *LLM Usage* para a RPC `fn_track_llm_usage` contendo tokens exatos e meta-dados da chamada utilizando ID idempotente.

---

## 🟢 FASE 2: Tracing Rigoroso e Níveis de Erro
**Objetivo:** O `trace_id` não é apenas uma coluna nova; é a lei da gravidade do seu sistema. Sem ele, nada se move, e todo erro será categorizado taticamente.

### ✅ Ticket 2.1: Geração e Exigência do Contrato
- **Status:** CONCLUÍDO (Script `ticket_2_1_tracing_contract.sql` gerado).
- Coluna `trace_id` injetada, indexada e imposta em toda a cadeia: `inbound_queue`, `messages` e `outbound_queue`.
- **Bônus de Observabilidade:** RPC `fn_get_trace_lifecycle` adicionada para rastrear visualmente uma mensagem ponta-a-ponta.

### ✅ Ticket 2.2: Padronização de Stack de Erros & Tracing Universal (Hospital)
- **Status:** CONCLUÍDO (Arquitetura DLQ Enterprise e N8N Error Workflow).
- Todos os erros inesperados, de sintaxe, ou TimeOut de IAs/APIs caem silenciosamente no nó centralizado.
- Amarração forte via Banco de Dados (`fn_bind_execution` e `fn_log_dlq_error` associando o `n8n_execution_id` diretamente à fila `inbound_queue_errors`).

---

## 🟡 FASE 3: Pipeline e Machine State (Desacoplamento de Workflows)
**Objetivo:** Acabar com o "God Workflow" que contém todos os nós. O Payload será Imutável na vida da mensagem, forçado por validações estritas logo no início do Pipeline.

### 🔄 Ticket 3.1: Contrato de Envelope & Estado (`stage`)
Adicione obrigatoriedade aos parâmetros usando Data Validation. Ao fluir pelo sistema, injeta onde o fluxo está (o "stage").

### 🔄 Ticket 3.2: Fatiar por Responsabilidade Pura (Sub-Workflows)
Desmembrar a cadeia via nó **"Execute Workflow"**, dividindo explicitamente as áreas:
1. **Normalize Inbound:** Valida a casca, rejeita imediatamente se não bater com a Interface Obrigatória.
2. **Context Builder:** Autenticação e Regras RAG/Governança.
3. **LLM Executor:** Camada purista e isolada.
4. **Tool Orchestrator:** Gerencia tentativas e sucessos de Action.
5. **Outbound Dispatcher:** Prepara a mediação final para o usuário.

---

## 🟡 FASE 4: Garantia Transacional & Saída Segura (Outbound/Idempotência)
**Objetivo:** Extirpar o problema de disparos duplos, gargalos eternos de Evolution/Meta, e perda de mensagens da IA. Idempotência e DLQ em toda a jornada.

### 🔄 Ticket 4.1: O `dispatch_id` Ouro (Fila Outbound)
1. Antes de bater no disparador HTTP do WhatsApp, grave e verifique um `dispatch_id`.
2. **Checagem de Idempotência:** `IF EXISTS (dispatch_id) => SKIP`. Um Timeout da Meta não causará mensagem duplicada.
3. Garantir que as Respostas do BOT fiquem cravadas no status Final da Fila (Outbound).

### ✅ Ticket 4.2: Motor de Resiliência Inbound (Fila Morta de Entrada)
- **Status:** CONCLUÍDO.
- Mensagens processadas que explodem no N8N não somem. São classificadas como erro e salvas no banco de dados isolado com o StackTrace limpo (Dead Letter Queue pronta).

---

## 🎯 RESUMO TÁTICO: O QUE FAZER AGORA?
Neste exato momento, o Inbound Queue, o Billing e o DLQ (Hospital) estão perfeitos e no ar. As duas próximas fronteiras vitais e prioritárias do Nexus Operacional são:

1. **(Alta Prioridade) A Fila de Disparo (Blindar o Outbound - Ticket 4.1):**
   - Atualmente, se o Robô pensar a resposta correta, a Evolution falhar ao mandar o WhatsApp e a IA reiniciar, algo quebra ou duplica?
   - Devemos garantir um sistema de controle de faturamento e disparo de respostas na tabela final, com Idempotência. (Assim o LLM nunca rodará a mesma resposta 2 vezes seguidas por um lag de rede).

2. **(Média Prioridade) Sub-Workflows e Desacoplamento N8N (Tickets 3.1 e 3.2):**
   - Transformar as atuais chamadas massivas do Agente Nexus em Workflows Auxiliares. 
   - Exemplo: o nó principal de Webhook da N8N apenas valida, chama o "Sub-flow Contexto", e depois chama o "Sub-Flow LLM". Deixa o visual e debug espetaculares.
