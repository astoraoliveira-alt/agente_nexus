# PLAN: Migração Evolution API → Zenvia (Meta Official) — Edenred
> **Cliente:** Edenred (1.750 estabelecimentos)  
> **Provedor:** Zenvia — API REST v2 (`https://api.zenvia.com/v2`)  
> **Impacto:** Porteiro (Inbound) + N8N (Outbound)  
> **Estimativa Total:** 3–4 dias de desenvolvimento

---

## 1. Contexto e Motivação

A Zenvia é um **provedor oficial Meta (BSP — Business Solution Provider)**, o que garante:
- ✅ API oficial sem risco de banimento de número
- ✅ Suporte a Templates HSM (mensagens ativas)
- ✅ Rastreabilidade de status de entrega (SENT, DELIVERED, READ, FAILED)
- ✅ Conformidade LGPD e políticas Meta Business

**Diferença crítica vs Evolution API:**

| Aspecto | Evolution API | Zenvia |
|---------|--------------|--------|
| Tipo de conexão | Unofficial (baileys) | BSP Oficial Meta |
| Webhook Inbound | MESSAGES_UPSERT | message event via Subscriptions |
| Envio Outbound | POST /message/sendText/{instance} | POST /v2/channels/whatsapp/messages |
| Auth | apikey: Bearer no header | X-API-TOKEN header |
| Formato do payload | Evolution-specific JSON | Zenvia contents[] array |
| Status delivery | Via MESSAGE_UPDATE event | Via Status Webhook (subscription separada) |

---

## 2. Arquitetura Multi-Provider (Sem Breaking Change)

A estratégia é **não alterar a arquitetura central**. O princípio é:

```
                        ┌─────────────────────────────────┐
                        │           PORTEIRO              │
                        │                                  │
Zenvia Webhook ────────▶│  /v1/zenvia/webhook             │
                        │    ↓ normaliza payload           │
Evolution Webhook ─────▶│  /v1/evolution/webhook          │──▶ inbound_queue
                        │    ↓ normaliza payload           │
                        └─────────────────────────────────┘
                                        │
                                        ▼
                                  N8N WORKFLOW
                                        │
                        ┌───────────────────────────────┐
                        │  Agente tem provider='zenvia'? │
                        │  YES → ZenviaAdapter.send()    │
                        │  NO  → EvolutionAdapter.send() │
                        └───────────────────────────────┘
```

**Campo novo na tabela `agents`:**
```sql
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS whatsapp_provider VARCHAR(20) DEFAULT 'evolution' 
    CHECK (whatsapp_provider IN ('evolution', 'zenvia', 'meta_direct'));

ADD COLUMN IF NOT EXISTS zenvia_channel_id VARCHAR(255); -- "from" number na Zenvia
ADD COLUMN IF NOT EXISTS zenvia_api_token TEXT; -- armazenado criptografado
```

---

## 3. FASE 1 — Inbound: Porteiro recebe webhook da Zenvia

**Esforço: 1 dia**

### 3.1 Formato do Webhook Zenvia (Inbound)

A Zenvia envia eventos via **Subscriptions**. O payload recebido no webhook:

```json
{
  "id": "01EX2AKBAFWS1EN088S9CJZ50T",
  "timestamp": "2021-07-08T00:02:00.000Z",
  "type": "MESSAGE",
  "channel": "whatsapp",
  "direction": "IN",
  "from": "5511999990000",
  "to": "5511888880000",
  "contents": [
    {
      "type": "text",
      "text": "Olá, quero saber sobre crédito"
    }
  ],
  "visitor": {
    "name": "João Silva",
    "firstName": "João"
  }
}
```

### 3.2 Nova Rota no Porteiro

```typescript
// porteiro/src/index.ts — ADICIONAR nova rota (sem alterar a Evolution)

app.post('/v1/zenvia/webhook', async (c) => {
  const body = await c.req.json();
  
  // Ignorar eventos de SAÍDA (direction=OUT) — evita loop
  if (body.direction === 'OUT') return c.json({ ok: true });

  // Ignorar eventos que não são MESSAGE
  if (body.type !== 'MESSAGE') return c.json({ ok: true });

  const phone = body.from;
  const pushName = body.visitor?.name || body.visitor?.firstName || phone;
  const channelId = body.to;

  const content = body.contents?.[0];
  let textContent = '';
  let messageType = 'text';
  let mediaUrl = '';
  let mimetype = '';

  if (content?.type === 'text') {
    textContent = content.text;
  } else if (content?.type === 'file') {
    textContent = content.fileCaption || '';
    messageType = content.fileMimeType?.startsWith('audio') ? 'audio' : 'image';
    mediaUrl = content.fileUrl;
    mimetype = content.fileMimeType;
  }

  // Busca o agente pelo zenvia_channel_id
  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id, tenant_id, name, whatsapp_provider')
    .eq('zenvia_channel_id', channelId)
    .eq('whatsapp_provider', 'zenvia')
    .eq('status', 'active')
    .single();

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  // Enfileira via RPC — MESMO fluxo da Evolution
  await supabaseAdmin.rpc('fn_enqueue_inbound_message', {
    p_agent_id: agent.id,
    p_tenant_id: agent.tenant_id,
    p_phone: phone,
    p_push_name: pushName,
    p_text: textContent,
    p_message_type: messageType,
    p_media_url: mediaUrl,
    p_mimetype: mimetype,
    p_external_id: body.id,
    p_platform: 'zenvia',
    p_priority: 100,
  });

  return c.json({ ok: true });
});
```

### 3.3 Configurar Subscription na Zenvia

```bash
curl -X POST "https://api.zenvia.com/v2/subscriptions" \
  -H "X-API-TOKEN: {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "MESSAGE",
    "webhook": {
      "url": "https://api.davosconsulting.com.br/v1/zenvia/webhook"
    },
    "criteria": {
      "channel": "whatsapp",
      "direction": "IN"
    }
  }'
```

---

## 4. FASE 2 — Outbound: N8N envia via Zenvia

**Esforço: 1 dia**

### 4.1 Formato de Envio Zenvia

```json
POST https://api.zenvia.com/v2/channels/whatsapp/messages
X-API-TOKEN: {token}

{
  "from": "5511888880000",
  "to": "5511999990000",
  "contents": [
    {
      "type": "text",
      "text": "Olá! Aqui é a Sofia 😊"
    }
  ]
}
```

### 4.2 Nó Adaptador no N8N (Code Node antes do HTTP Request de envio)

```javascript
const agent = $('Edit Fields').first().json.agent;
const provider = agent.whatsapp_provider || 'evolution';
const message = $json.message;
const userPhone = $('Edit Fields').first().json.conversation.user_identifier;

if (provider === 'zenvia') {
  return [{
    json: {
      provider: 'zenvia',
      send_url: 'https://api.zenvia.com/v2/channels/whatsapp/messages',
      send_headers: { 'X-API-TOKEN': agent.zenvia_api_token },
      send_body: {
        from: agent.zenvia_channel_id,
        to: userPhone,
        contents: [{ type: 'text', text: message }]
      }
    }
  }];
} else {
  // Evolution (comportamento atual — não muda)
  return [{
    json: {
      provider: 'evolution',
      send_url: `${agent.serverURL}/message/sendText/${agent.evolution_instance}`,
      send_headers: { 'apikey': agent.evolution_token },
      send_body: { number: userPhone, text: message }
    }
  }];
}
```

### 4.3 Status Webhook (Delivery Tracking — Opcional Fase 1)

```typescript
// Nova rota no Porteiro para receber confirmação de entrega
app.post('/v1/zenvia/status', async (c) => {
  const body = await c.req.json();
  
  if (body.messageStatus?.code === 'FAILED') {
    await supabaseAdmin
      .from('outbound_queue')
      .update({ status: 'failed' })
      .eq('external_message_id', body.messageId);
  }
  
  return c.json({ ok: true });
});
```

---

## 5. FASE 3 — Database Migration

**Esforço: 0.5 dia**

```sql
-- Multi-provider nos agentes
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS whatsapp_provider VARCHAR(20) DEFAULT 'evolution'
    CHECK (whatsapp_provider IN ('evolution', 'zenvia', 'meta_direct'));

ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS zenvia_channel_id VARCHAR(255);

ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS zenvia_api_token TEXT;

-- Índice para lookup por channel_id
CREATE INDEX IF NOT EXISTS idx_agents_zenvia_channel 
ON public.agents (zenvia_channel_id) 
WHERE whatsapp_provider = 'zenvia';

-- Rastrear external_message_id do retorno Zenvia
ALTER TABLE public.outbound_queue
ADD COLUMN IF NOT EXISTS external_message_id VARCHAR(255);
```

---

## 6. FASE 4 — Testes e Validação E2E

**Esforço: 1 dia**

### Checklist

- [ ] Webhook Zenvia chegando no Porteiro (`/v1/zenvia/webhook`)
- [ ] Mensagem sendo enfileirada na `inbound_queue` com `platform='zenvia'`
- [ ] N8N processando e gerando resposta (sem mudança)
- [ ] Nó adaptador roteando para Zenvia corretamente
- [ ] Resposta aparecendo no WhatsApp do usuário
- [ ] Status de entrega sendo recebido (`/v1/zenvia/status`)
- [ ] Telemetria de custo sendo gravada normalmente
- [ ] Chat no portal exibindo as mensagens corretamente

---

## 7. Resumo de Esforço

| Fase | Entregável | Estimativa | Risco |
|------|-----------|-----------|-------|
| **1 — Inbound Porteiro** | Nova rota `/v1/zenvia/webhook` | **1 dia** | 🟢 Baixo |
| **2 — Outbound N8N** | Adaptador de provider no workflow | **1 dia** | 🟡 Médio |
| **3 — Database** | Migration SQL + campos novos | **0.5 dia** | 🟢 Baixo |
| **4 — Testes E2E** | Sandbox Zenvia + validação | **1 dia** | 🟡 Médio |
| **TOTAL** | Sistema multi-provider funcionando | **3–4 dias** | 🟢 Controlado |

### Pré-requisitos (Bloqueadores Externos)

- [ ] Conta Zenvia ativa com o número da Edenred configurado
- [ ] API Token Zenvia gerado no console (app.zenvia.com/home/api)
- [ ] Número WhatsApp Business aprovado pela Meta
- [ ] Acesso ao Sandbox Zenvia para testes

### O que NÃO muda

- ✅ Banco de dados core (apenas adição de colunas)
- ✅ Fluxo interno do N8N (apenas novo nó de roteamento)
- ✅ RPC `fn_enqueue_inbound_message` (mesma chamada)
- ✅ Chat no portal — mensagens chegam iguais
- ✅ Telemetria de custos — `fn_track_llm_usage` não muda
- ✅ Todos os outros clientes na Evolution continuam sem impacto

---

*Plano criado em: 03/Abr/2026 | Versão: 1.0*
