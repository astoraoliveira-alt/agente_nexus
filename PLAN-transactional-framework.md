# Transactional Agent Framework (B2B Identity Gate)

## 1. Overview
Transformar o Agent Nexus Hub de uma plataforma de chatbots conversacionais genéricos para um **Secure Transactional Hub**. O objetivo é permitir que agentes de IA executem integrações sensíveis (envio de boletos, documentos médicos, dados financeiros) acopladas a uma camada robusta de autenticação via conversa (WhatsApp/Web), sem criar silos ou lógicas "hardcoded" por cliente.

---

## 2. O Verdadeiro MVP (Escopo Estrito)

O MVP **não** é o framework inteiro com múltiplas telas e opções complexas de autenticação (OTP/Email/SMS). 
O escopo real e mínimo para agregar valor e segurança é:
1. Criar a tabela `conversation_security_sessions`.
2. Criar o RPC `evaluate_conversation_security`.
3. Fazer o N8N chamar esse RPC antes de injetar as tools.
4. Mascarar tools quando `allowToolExecution = false`.

**O que NÃO fazer agora (Fora do Escopo MVP):**
* Sem UI nova ou painéis ultra detalhados.
* Sem múltiplos métodos de validação.
* Sem OTP ou tokens externos (apenas validação sintática e de API do CNPJ/CPF).
* Sem configuração granular por intent individual.
* Sem armazenar documentos (boletos) no banco (atuação estrita como middleware repassando links ou blobs para evitar riscos de LGPD/Custódia).

---

## 3. Security & Transactional Model (As 3 Camadas)

Para evitar que a segurança seja delegada ao LLM, a arquitetura é focada em contenção prévia:

### Layer 1: Intent Classification (Classificação e Despacho)
Antes da chamada final, classifica a intenção (ex: `financial_data`, `document_transfer`, `support`).

### Layer 2: Security Policy Engine (O Gatekeeper no Supabase / RPC)
Uma função PL/pgSQL encapsulada, que checa permissões no banco sem gerenciar regras de negócios do terceiro.
* **Regras Simples (V1):**
    * Se a intenção *não* está protegida ➔ `allow = true`
    * Se protegida e sessão `active` ➔ `allow = true`
    * Se protegida e não `active` ➔ `allow = false`

### Layer 3: Tool Injection Layer (O Encanamento no n8n)
O N8N omite completamente a descrição/API da ferramenta se recebido bloqueio da Layer 2, impedindo "engenharia de prompt".

---

## 4. Ordem Realista de Implementação

### Fase 0: Preservação do Ecossistema (Rollout Strategy)
* **Status Quo:** Não mexer no que já funciona.
* **Feature Flag Default:** Na estrutura do DB e lógicas, agents nascem ou operam com `{ "capabilities": { "identity_gate": { "enabled": false } } }`.
* **Resultado:** Nenhum fluxo de cliente atual quebra, e agentes atuais não mudam o comportamento até serem explicitamente ativados.

### Fase 1: Fundação no Banco de Dados (Porque Segurança é Determinística)
O LLM não pode ser o cérebro da permissão. Inicia-se pela infraestrutura relacional:
1. **Tabela `conversation_security_sessions`**
   * Campos mínimos: `id`, `conversation_id`, `agent_id`, `status` (unauthenticated | active | locked | expired), `validated_identifier` (hash), `failed_attempts`, `locked_until`, `expires_at`, `created_at`, `updated_at`.
2. **RPC Simples (`evaluate_conversation_security`)**
   * Entrada: `agent_id`, `conversation_id`, `intent`
   * Saída: `allowToolExecution`, `requiresValidation`, `session_status`.

### Fase 2: Ajuste no Orquestrador (Virada de Chave no N8N)
A mudança estrutural que separa produto de chatbot comum. A Sensibilidade é ativada no `brain_config` (ex: `conversation_mode: "transactional"` e `identity_gate.enabled: true`).

**Fluxo Antigo N8N:** 
* User ➔ LLM ➔ Tools
   
**Novo Fluxo N8N:** 
* User ➔ Intent Classifier ➔ **RPC Security** ➔ (Se Autorizado) LLM + Tools ➔ (Se NÃO Autorizado) LLM sem Tools, exigindo Validação.

---

## 5. Timeline & Task Breakdown

| Período | Foco | Tarefas Previstas |
|---------|------|-------------------|
| **Semana 1** | Infraestrutura | • Criar Migration da Tabela (`conversation_security_sessions`).<br>• Desenvolver o RPC (Regras simples iniciais).<br>• Definir Feature Flags padrão no Typescript e DB. | ✅ _Concluído_ |
| **Semana 2** | Gatekeeper (N8N) | • Modificar o Workflow do N8N para fazer a chamada no RPC.<br>• Implementar lógica de mascaramento de tools (Tool Injection Masking). | ✅ _Concluído_ |
| **Semana 3** | Operacionalização | • Implementar validação básica de entrada (ex: checagem de formato CNPJ).<br>• Testes rigorosos de Brute-Force (exigindo locks da tabela). | ✅ _Concluído_ |

> *A UI refinada para configuração das abas será feita posteriormente, assim como a adição de métodos OTP. O MVP provará a segurança em camada de infraestrutura/middleware.* 

---

## 6. Success Criteria & Verification
- [x] TypeScript Build and Types checked para os novos flags.
- [x] Banco de dados preserva integridade relacional entre `agents` e `conversations`.
- [x] Agent Config fallback: `false` para agentes novos ou antigos (Estratégia de Rollout respeitada sem quebrar instâncias).
- [x] N8N recusando ferramentas financeiras quando executado a frio sem injeção prévia autorizada no BD.
