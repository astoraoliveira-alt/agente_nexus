# Arquitetura Human-in-the-Loop (HITL) - Davos Nexus

Este documento descreve o fluxo técnico de atendimento híbrido (IA + Humano) e como as mensagens transitam entre o Painel do Operador e a Landing Page (Chat do Cliente).

## 🔄 Fluxo Bidirecional de Mensagens

O sistema utiliza o **Supabase** como barramento de mensagens em tempo real (Pub/Sub). Não há comunicação direta ponto-a-ponto entre o Painel e a Landing Page; ambos "observam" a mesma tabela de dados (`messages`).

### 1. Mensagem do Operador para o Cliente (Sua dúvida)

Quando o operador envia uma mensagem pelo Nexus Hub:

1.  **Nexus Hub (Frontend)**:
    *   Chama `api.sendMessage()`.
    *   Executa um `INSERT` na tabela `messages` com `sender_type = 'human'`.
2.  **Supabase (Database)**:
    *   Grava a mensagem de forma persistente.
    *   Dispara um evento **Realtime (Broadcast)** para o canal `conversation:{id}`.
3.  **Landing Page (Cliente)**:
    *   O widget de chat da Landing Page mantém uma conexão WebSocket aberta (`supabase.channel().on(...)`).
    *   Ele recebe instantaneamente o evento `INSERT` do Supabase.
    *   A UI adiciona a nova mensagem na tela do cliente.

> **Nota:** O N8N (Agente IA) **NÃO** é acionado neste fluxo se o status da conversa for `human_active`.

---

### 2. Mensagem do Cliente para o Operador

1.  **Landing Page**:
    *   Usuário digita e envia.
    *   Widget faz `INSERT` em `messages` com `sender_type = 'user'`.
2.  **Supabase**:
    *   Grava e dispara evento Realtime.
3.  **Nexus Hub (Frontend)**:
    *   Recebe o evento via Polling (5s) ou Realtime (se implementado) e atualiza a tela do operador.
4.  **N8N (IA)**:
    *   Se `status = 'human_active'`: O gatilho do banco ignora ou o fluxo N8N verifica o status e encerra sem responder (`NO-OP`).
    *   Se `status = 'ai_active'`: O N8N processa e gera resposta (via IA).

---

## 🔒 Regras de Bloqueio da IA

Para garantir que a IA não "atravesse" o operador humano, o status da conversa é autoritativo (`conversations.status`).

| Status | Quem Responde? | Comportamento do Sistema |
| :--- | :--- | :--- |
| `ai_active` | **IA (N8N)** | N8N processa webhooks/eventos. Operador apenas monitora (modo leitura). |
| `human_active` | **Humano** | N8N deve abortar execução. Operador tem permissão de escrita. Input desbloqueado na UI. |
| `closed` | **Ninguém** | Conversa arquivada. Nenhuma interação permitida. |

---

## 🛠 Exemplo de Implementação na Landing Page (Client-Side)

Para a Landing Page receber as mensagens do operador, ela deve implementar o seguinte listener:

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const conversationId = '...' // ID da conversa atual

// Assinar canal da conversa
const channel = supabase
  .channel(`chat:${conversationId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`
    },
    (payload) => {
      const newMessage = payload.new
      
      // Se a mensagem não foi enviada por mim (user), exibo na tela
      if (newMessage.sender_type !== 'user') {
        appendMessageToUI(newMessage.content, newMessage.sender_type) // 'human' ou 'ai'
      }
    }
  )
  .subscribe()
```

## 📜 Auditoria (Logs)

Toda transição de "Bastão" é auditada na tabela `audit_logs`:

*   **Takeover**: Quando operador clica em "Assumir".
*   **Resume AI**: Quando operador clica em "Devolver para IA".

Isso garante conformidade com ISO 42001 (Human Oversight).
