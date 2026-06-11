# Guia: Implementar Reply Guard no Workflow N8N

## Contexto

O `Reply Guard` é um conjunto de nós a adicionar no final de cada branch de envio do workflow `Agente Nexus - Whatts Fila`. Ele garante que toda falha de entrega seja registrada como `reply_gap` no banco de dados, tornando-a visível na plataforma.

---

## Onde adicionar (Mapa do Fluxo)

```
Fluxo atual:
  LLM → Guardrail (Code) → Envio Zenvia  ──→ record_message → FIM
                         → Envio Evolution──┘

Fluxo com Reply Guard:
  LLM → Guardrail (Code) → Envio Zenvia  ──→ [Reply Guard] → record_message → FIM
                         → Envio Evolution──→ [Reply Guard] ─┘
```

O `[Reply Guard]` fica **entre** o nó de envio (Zenvia/Evolution) e o `record_message`.

---

## Nós a Adicionar (por branch)

### Para CADA nó de envio (Zenvia e Evolution), adicionar:

#### Nó 1: IF — Verificar Sucesso do Envio
- **Tipo**: `n8n-nodes-base.if`
- **Nome sugerido**: `Reply Guard - Zenvia OK?` / `Reply Guard - Evolution OK?`
- **Condição (Zenvia)**:
  - `{{ $json.id }}` → **is not empty** ✅
  - _(A Zenvia retorna `id` apenas quando a mensagem foi aceita. Não há campo `error` na resposta de sucesso.)_
- **Condição alternativa** (se usar "Continue on Fail" no HTTP Request):
  - `{{ $response.statusCode }}` → **equal to** → `200`


#### Nó 2 (Branch TRUE - Sucesso): HTTP Request → fn_mark_reply_sent
- **Tipo**: `n8n-nodes-base.supabase` (RPC) ou HTTP Request
- **Nome sugerido**: `RPC - Mark Reply Sent`
- **Method**: `POST`
- **URL**: `{{ $env.SUPABASE_URL }}/rest/v1/rpc/fn_mark_reply_sent`
- **Body**:
```json
{
  "p_trace_id": "={{ $('RPC - Acesso Entrada').item.json.trace_id }}",
  "p_queue_id": "={{ $('RPC - Acesso Entrada').item.json.id }}"
}
```

#### Nó 3 (Branch FALSE - Falha): HTTP Request → fn_log_reply_gap
- **Tipo**: `n8n-nodes-base.supabase` (RPC) ou HTTP Request
- **Nome sugerido**: `RPC - Log Reply Gap`
- **Method**: `POST`
- **URL**: `{{ $env.SUPABASE_URL }}/rest/v1/rpc/fn_log_reply_gap`
- **Body**:
```json
{
  "p_queue_id": "={{ $('RPC - Acesso Entrada').item.json.id }}",
  "p_error_message": "={{ $json.error || $json.message || 'Delivery failed: ' + $json.statusCode }}",
  "p_context": {
    "n8n_execution_id": "={{ $execution.id }}",
    "phone": "={{ $('RPC - Acesso Entrada').item.json.payload.phone }}",
    "agent_id": "={{ $('RPC - Acesso Entrada').item.json.agent_id }}",
    "tenant_id": "={{ $('RPC - Acesso Entrada').item.json.tenant_id }}",
    "error_response": "={{ JSON.stringify($json) }}"
  }
}
```

---

## JSON dos Nós (Importação Direta)

Você pode importar os nós abaixo diretamente no editor N8N (Ctrl+V no canvas):

```json
{
  "nodes": [
    {
      "id": "reply-guard-if-zenvia",
      "name": "Reply Guard - Zenvia OK?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [0, 0],
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "loose"
          },
          "conditions": [
            {
              "id": "condition-status-ok",
              "leftValue": "={{ $json.statusCode }}",
              "rightValue": 200,
              "operator": {
                "type": "number",
                "operation": "gte"
              }
            },
            {
              "id": "condition-no-error",
              "leftValue": "={{ $json.error }}",
              "rightValue": "",
              "operator": {
                "type": "string",
                "operation": "empty"
              }
            }
          ],
          "combinator": "or"
        }
      }
    },
    {
      "id": "rpc-mark-reply-sent",
      "name": "RPC - Mark Reply Sent",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [200, -100],
      "parameters": {
        "method": "POST",
        "url": "={{ $env.SUPABASE_URL }}/rest/v1/rpc/fn_mark_reply_sent",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "apikey", "value": "={{ $env.SUPABASE_ANON_KEY }}" },
            { "name": "Authorization", "value": "=Bearer {{ $env.SUPABASE_SERVICE_KEY }}" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "p_trace_id", "value": "={{ $('RPC - Acesso Entrada').item.json.trace_id }}" },
            { "name": "p_queue_id", "value": "={{ $('RPC - Acesso Entrada').item.json.id }}" }
          ]
        }
      }
    },
    {
      "id": "rpc-log-reply-gap",
      "name": "RPC - Log Reply Gap",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [200, 100],
      "parameters": {
        "method": "POST",
        "url": "={{ $env.SUPABASE_URL }}/rest/v1/rpc/fn_log_reply_gap",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "apikey", "value": "={{ $env.SUPABASE_ANON_KEY }}" },
            { "name": "Authorization", "value": "=Bearer {{ $env.SUPABASE_SERVICE_KEY }}" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={\n  \"p_queue_id\": \"{{ $('RPC - Acesso Entrada').item.json.id }}\",\n  \"p_error_message\": \"{{ $json.error || $json.message || 'Delivery failed: HTTP ' + $json.statusCode }}\",\n  \"p_context\": {\n    \"n8n_execution_id\": \"{{ $execution.id }}\",\n    \"phone\": \"{{ $('RPC - Acesso Entrada').item.json.payload.phone }}\",\n    \"agent_id\": \"{{ $('RPC - Acesso Entrada').item.json.agent_id }}\",\n    \"tenant_id\": \"{{ $('RPC - Acesso Entrada').item.json.tenant_id }}\",\n    \"platform\": \"{{ $('RPC - Acesso Entrada').item.json.payload.platform }}\"\n  }\n}"
      }
    }
  ]
}
```

---

## Diagrama Visual

```
[Envio Zenvia]
      │
      ▼
[Reply Guard - Zenvia OK?]
      │
  ┌───┴──────────────┐
  │ TRUE (sucesso)   │ FALSE (falha)
  ▼                  ▼
[RPC - Mark       [RPC - Log
 Reply Sent]       Reply Gap]
  │                  │
  └────────┬─────────┘
           ▼
   [record_message]
```

---

## Job de Varredura Periódica (Reativo)

Para cobrir casos que o N8N não capturou, agende um workflow separado no N8N que chama `fn_check_reply_gap` a cada 30 minutos:

### Workflow: "Reply Gap Monitor"

1. **Trigger**: Schedule — a cada 30 minutos (`*/30 * * * *`)
2. **Nó**: HTTP Request → `POST /rest/v1/rpc/fn_check_reply_gap`
   ```json
   {
     "p_lookback_minutes": 60,
     "p_grace_minutes": 5
   }
   ```
3. **Nó**: IF — `{{ $json.gaps_logged }} > 0`
4. **Branch TRUE**: (Opcional) Enviar notificação Slack/email com contagem de gaps

---

## Resumo das Calls por Cenário

| Cenário | O que acontece |
|---------|---------------|
| Envio bem-sucedido via Zenvia/Evolution | `fn_mark_reply_sent` → `reply_sent = TRUE` |
| Falha no envio (Zenvia 502, timeout) | `fn_log_reply_gap` → gap registrado em `inbound_queue_errors` |
| `record_message` chamado com mensagem outbound | `reply_sent = TRUE` automaticamente via UPDATE no trigger |
| Job de varredura (a cada 30min) | `fn_check_reply_gap` detecta qualquer gap residual |
