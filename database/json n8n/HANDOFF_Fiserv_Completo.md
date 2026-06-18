# HANDOFF TÉCNICO — Integração Fiserv (Clover Capital) · Jornada de Crédito Nativa

Documento de implementação para o time/agente de desenvolvimento (Antigravity).
Consolida toda a integração com a API de crédito Clover Capital (Fiserv/MoneyMoney): contratos de API validados ao vivo, os fluxos n8n criados, a ligação no fluxo principal, banco, isolamento multi-tenant, telemetria e o plano de virada.

> **Status geral:** API 100% validada no sandbox (create, leitura, simulação e confirmação). Subworkflow e poller construídos e validados. Receptor de webhook com infra pronta (falta o miolo, dependente da doc da Fiserv). Falta ligar a jornada no fluxo principal.

---

## 0. A mudança de produto (o "porquê")

**Hoje (produção):** a jornada Edenred é **baseada em link**. O agente detecta a intenção, envia o `cta_link` (com tokens JWT/CNPJ) e o lojista **sai da conversa** para a página da Fiserv Capital, onde faz a validação de crédito. A telemetria conta "Link Enviado" buscando a string `%fiservcapital%`.

**Novo (este handoff):** a jornada passa a ser **nativa, dentro da conversa**. O agente coleta os dados, chama a API da Fiserv diretamente, acompanha a avaliação assíncrona e **apresenta a oferta (taxa, parcela, condições) dentro do WhatsApp**. O lojista não sai mais para uma página externa.

Consequência direta: o passo do Roteador que hoje **envia o link** passa a **iniciar a jornada nativa**. Mesmo ponto de entrada (intent `SIMULATION_REQUEST`), gatilho diferente.

---

## 1. Visão geral da arquitetura

Quatro peças, sendo três fluxos n8n novos + a ligação no fluxo principal:

| Peça | Tipo | Função |
|---|---|---|
| **Ferramenta Fiserv Credito** | subworkflow (Execute Workflow Trigger) | Cliente da API: login + 1 ação por chamada. Reusado por todos. |
| **Fluxo principal (branch de crédito)** | edição no fluxo existente | Coleta conversacional + `create_lead` + carimbo. |
| **Receptor Webhook Fiserv** | workflow (Webhook Trigger) | Recebe notificação da Fiserv → atualiza status → outbound. |
| **Poller Fiserv Credito** | workflow (Schedule Trigger) | Rede de segurança: varre leads pendentes (cadência baixa). |

A jornada se divide em **duas fases**:

- **Síncrona (dentro do turno do WhatsApp):** intenção → Gatekeeper (CNPJ) → coleta Parrot (faturamento, valor, opt-in) → `create_lead` → carimbo → resposta "avaliando ~1 min".
- **Assíncrona (fora do turno, via outbound):** webhook/poller detecta a decisão → `get_result` → apresenta a oferta (`offer_data`) → simula/confirma.

A avaliação leva **~1 min em produção**, por isso a decisão **nunca** volta no mesmo turno — ela é entregue por **outbound** (`handle_outbound_sent`).

---

## 2. API Fiserv (Clover Capital) — referência completa

Todos os contratos abaixo foram **validados ao vivo no sandbox**.

### 2.1 Ambientes

| Ambiente | Base URL |
|---|---|
| Sandbox | `https://apidev.moneymoneyinvest.com.br` |
| Produção | `https://api.moneymoneyinvest.com.br` |

Credenciais ficam em variáveis de ambiente (ver seção 3.4). **Nunca hardcode em workflow exportado.**

### 2.2 Autenticação

**`POST /business-partners/api/v2/login`**
- Body: `{ "email": "<...>", "password": "<...>" }`
- Resposta 200: `{ "token": "<JWT>", "refresh_token": "<JWT>" }`
- **TTL do access token: 5 minutos** (`exp - iat = 300s`).
- Todas as demais chamadas usam header `Authorization: Bearer <token>`.
- Comportamento de erro de auth:
  - Sem header → `401 { "error": "unauthenticated" }`
  - Token inválido ou **expirado** → `401 { "error": "invalid_token" }`
- Estratégia adotada: **login fresco a cada execução do subworkflow** (execuções são curtas, <5min). Não há gestão de refresh no caminho atual.

### 2.3 Criar lead — `create_lead`

**`POST /business-partners/clover-capital/loan-requests`**

Body:
```json
{
  "contact_name": "string",
  "contact_phone_number": "11999999999",   // SOMENTE DÍGITOS, 11 dígitos (sem o 55)
  "registration_code": "00000000000000",   // CNPJ, somente dígitos
  "revenue": 84500,                          // faturamento (número)
  "requested_amount": 75000,                 // valor desejado (número)
  "contact_email": "opcional@empresa.com",  // opcional
  "opt_in": true,                            // opcional; se true, exige os 3 abaixo
  "opt_in_ip": "200.150.10.20",
  "opt_in_signer_name": "string",
  "opt_in_timestamp": "2026-06-12T02:00:00Z" // auto-preenchível (now) se ausente
}
```

Resposta **201**:
```json
{ "message": "Lead registered successfully", "created_at": "...", "loan_request_id": 6762, "cache_interval_days": 30 }
```

Regras e comportamentos importantes:
- **Payload inválido / campo obrigatório faltando → `403 "Forbidden"` (texto puro)**, NÃO 422. (Comportamento atípico da API; o erro de validação do create vem como 403.)
- **Cache de 30 dias por CNPJ:** recriar o mesmo CNPJ dentro de 30 dias **retorna o lead existente** (201, mesmo `loan_request_id`), não cria novo. É o comportamento anti-duplicação esperado.
- **Rate limit: 100 criações / 24h** (único endpoint com limite). Ajustável conforme volume — calibrar antes de escalar (Edenred ~1.750 estabelecimentos).

### 2.4 Consultar status — `get_status`

**`GET /business-partners/clover-capital/loan-requests/{loan_request_id}/status`**

Resposta 200:
```json
{ "status": "in_progress", "loan_request_id": 6762, "denial_reason": null, "external_status": "Solicitação de contato enviada" }
```

### 2.5 Consultar resultado completo — `get_result` (usado pelo poller/webhook)

**`GET /business-partners/clover-capital/loan-requests/{cnpj}`**

Resposta 200:
```json
{
  "status": "approved",
  "amount": "148593",
  "loan_request_id": 6779,
  "installments": 18,
  "trackings": [],
  "denial_reason": null,
  "external_status": "Pré-aprovado",
  "offer_data": { /* ver 2.8 */ }
}
```
> **Use `get_result` (não `get_status`) no acompanhamento**: ele traz status **e** `offer_data` na mesma resposta. No instante em que o lead vira `approved`, a oferta já vem junta — sem segunda chamada.

### 2.6 Simular — `simulate`

**`POST /business-partners/clover-capital/loan-requests/{loan_request_id}/simulation`**

Body: `{ "requested_amount": 50000, "requested_installments": 12 }`

Resposta 200: `{ "simulation_data": { /* mesma forma do offer_data, ver 2.8 */ } }`

Regras (envelope) — validado:
- `requested_installments`: **6 a 24**. Fora disso → `422 "Invalid requested duration"`.
- `requested_amount`: **dentro do limite aprovado** do lead. Fora → `422 "Invalid requested amount"`.
- Lead ainda não avaliado/ratificado → `400 { "errors": { "detail": "missing loan request rating" } }`.
- **Read-only e repetível** → é seguro expor como ferramenta que a LLM chama para variações ("quanto fica 30k em 6x").

### 2.7 Confirmar — `confirm`

**`POST /business-partners/clover-capital/loan-requests/{loan_request_id}/confirm_simulation`**

Body:
```json
{ "contact_name": "string", "contact_email": "string", "contact_phone_number": "11999999999", "installments": 12, "requested_amount": 50000 }
```
Resposta **200** (corpo vazio).

> ⚠️ **Inconsistência da API a manter:** `simulate` usa `requested_installments`; `confirm` usa `installments`. Não é erro — é assim mesmo.
> ⚠️ **`confirm` é transacional** (efetiva o crédito). Tem que ser passo travado (Parrot) + idempotência. Nunca uma tool-call autônoma da LLM.

### 2.8 Campos de `offer_data` / `simulation_data` (10 campos)

```
PercJurosMensal    // % juros ao mês
PercJurosAnual     // % juros ao ano
PercCETMensal      // % CET ao mês
PercCETAnual       // % CET ao ano
SomaPrincipal      // principal
VlrParcela         // valor da parcela
VlrIOF             // IOF
VlrTAC             // TAC
VlrTotalCredito    // total do crédito
VlrTotalDivida     // total da dívida
```
Exemplo real (lead 6779, approved, 148593 em 18x): `VlrParcela 11073.82, PercJurosMensal 2.6, PercJurosAnual 36.07, PercCETMensal 3.29, PercCETAnual 47.46, VlrIOF 3790.91, VlrTAC 5200.755, VlrTotalCredito 157584.67, VlrTotalDivida 199328.77`.

`offer_data` vem **vazio (`{}`)** em estágios não-elegíveis (ver 2.9).

### 2.9 Máquina de estados (status)

| Grupo | Status | `offer_data` | Ação do acompanhamento |
|---|---|---|---|
| **Pendente** (continua varrendo) | `in_progress`, `fail_to_contact`, `contact_updated` | vazio | aguarda |
| **Oferta disponível** (`outcome=offer`) | `approved`, `in_quoting`, `comite`, `comite_approved`, `formalization`, `won` | **populado** | decidido → outbound com oferta |
| **Negado/encerrado** (`outcome=rejected`) | `denied`, `fails_to_process`, `lost`, `cancelled` | vazio | decidido → outbound de negativa |

> `fail_to_contact` tem a rota `PATCH .../change-contactnumber` para reabilitar contato (fora do escopo do poller; tratar no conversacional se necessário).

### 2.10 Resumo de regras transversais

| Regra | Valor |
|---|---|
| Token TTL | 5 min |
| Rate limit | 100 creates / 24h (ajustável) |
| Cache CNPJ | 30 dias (não configurável hoje) |
| Telefone | somente dígitos, **sem o 55** (11 dígitos) |
| CNPJ | somente dígitos |
| Envelope simulação | amount ≤ limite aprovado; installments 6–24 |
| 403 no create | = payload inválido (não 422) |

---

## 3. Subworkflow `Ferramenta Fiserv Credito`

Arquivo: `Ferramenta_Fiserv_Credito.json` · n8n id: `4C_a-PDwy9pIESe1sLqXP`

### 3.1 Propósito

Cliente determinístico da API. **Não** é a LLM chamando endpoints soltos — é uma peça única (padrão dos subworkflows de Boleto/Segurança existentes) que encapsula `login + 1 ação`. Chamado via Execute Workflow / Tool Workflow.

### 3.2 Contrato de entrada

`{ action, ...campos }`, onde `action ∈ {create_lead, get_status, get_result, simulate, confirm}`:

| action | campos |
|---|---|
| `create_lead` | contact_name, contact_phone_number, registration_code(cnpj), revenue, requested_amount; opcional contact_email; opt_in(+opt_in_ip, opt_in_signer_name) |
| `get_status` | loan_request_id |
| `get_result` | cnpj |
| `simulate` | loan_request_id, requested_amount, requested_installments |
| `confirm` | loan_request_id, contact_name, contact_email, contact_phone_number, installments, requested_amount |

### 3.3 Contrato de saída

```json
{
  "ok": true,
  "action": "create_lead",
  "http_status": 201,
  "error": null,
  "warnings": [],
  "data": { /* corpo bruto da Fiserv */ },
  "loan_request_id": 6762,
  "status": "...",
  "external_status": "...",
  "offer_data": { },
  "simulation_data": { }
}
```
- `ok = (http_status entre 200 e 299)`.
- 4xx volta como **dado** (`ok:false`), não quebra o fluxo (graças a `neverError`).
- Atalhos (`loan_request_id`, `status`, `offer_data`, etc.) extraídos do corpo quando presentes.

### 3.4 Cadeia de nós

```
Entrada (Tool Trigger) → VARS → Preparar entrada → Login Fiserv → Montar requisicao
  → IF Metodo → (Chamar Fiserv [POST] | Chamar Fiserv (GET)) → Normalizar resposta
```

- **VARS** (Set): em **modo teste**, embute `FISERV_BASE_URL`, `FISERV_EMAIL`, `FISERV_PASSWORD` (sandbox). **Em produção:** trocar as referências `$('VARS').first().json.FISERV_*` por `$env.FISERV_*` nos nós `Login Fiserv` e `Montar requisicao`, e **apagar o nó VARS**.
- **Preparar entrada** (Code): lê o payload do trigger por nome (`$('Entrada (Tool Trigger)').first().json`), normaliza (CNPJ/telefone só dígitos, opt_in_timestamp default `now`), gera `warnings` de campos faltando. A API é a validadora final.
- **Login Fiserv** (HTTP POST): `neverError:true`. Retorna `token`.
- **Montar requisicao** (Code): por `action`, monta `{ method, url, sendBody, body }`. Padrão "Universal API Proxy": GET sem body.
- **IF Metodo**: `{{ $json.method }} == "POST"` → ramo POST; senão → ramo GET.
- **Chamar Fiserv (POST)**: Send Body ON, `jsonBody = {{ $json.body }}`, headers `Authorization: Bearer {{ $('Login Fiserv').first().json.token }}`, `Accept` e `Content-Type: application/json`. `options.response.response = { fullResponse:true, neverError:true }`.
- **Chamar Fiserv (GET)**: sem body, sem Content-Type; mesma auth e options.
- **Normalizar resposta** (Code): lê `r.data ?? r.body` (com `fullResponse`, esta versão do n8n traz o corpo em `.body` no sucesso e `.data` no erro), monta o contrato de saída.

### 3.5 Armadilhas resolvidas (não regredir)

- O telefone deve perder o `55` (banco grava `5541...`, API quer `41...`).
- Send Body precisa estar **ligado de forma estática** no nó POST (expressão no toggle não envia o corpo de forma confiável).
- Sem `Content-Type: application/json`, a API (Phoenix) não parseia o corpo → 403 de "payload vazio".
- `create_lead` sempre com **CNPJ novo** em teste (cache de 30 dias).

---

## 4. Fluxo principal — branch de crédito + carimbo

Esta é a edição no fluxo conversacional existente. **Não** vai no subworkflow (que é genérico).

### 4.1 Onde dispara

O `create_lead` é um **desfecho determinístico do Roteador**, não uma tool-call livre da LLM. A coleta é multi-turno (Parrot pergunta CNPJ → faturamento → valor → opt-in), acumulando no estado da conversa (`context_state`/memória de curto prazo V49). A cada turno o Roteador avalia:

- **Faltam campos?** → Parrot pede o próximo.
- **Tem `cnpj` + `revenue` + `requested_amount` + `opt_in` E ainda NÃO carimbado?** → dispara o ramo `create_lead`.

**Guarda de idempotência (obrigatória):** antes de criar, checar se o lead já tem `metadata.loan_request_id`. Se sim, **não recria** (evita recriar a cada mensagem do lojista enquanto espera, e bater no cache de 30 dias à toa). A existência do carimbo É o flag "já solicitado".

### 4.2 Cadeia de nós (4 nós novos)

```
Roteador → [dados completos E não carimbado]
   → Montar input create_lead (Set)
   → Ferramenta Fiserv (Execute Workflow, action=create_lead)
   → IF: ok && loan_request_id
        ├─ true  → Carimbo (Postgres UPDATE) → resposta Parrot "avaliando ~1 min"
        └─ false → tratar erro (mensagem de falha + log/retry)
```

### 4.3 Nó "Montar input create_lead" (mapeamento de campos)

```
action               = "create_lead"
contact_name         = {{ lead.name }}                  // agent_leads.name
registration_code    = {{ state.cnpj }}                 // do Gatekeeper (access_key)
revenue              = {{ state.revenue }}              // coletado no Parrot
requested_amount     = {{ state.requested_amount }}     // coletado no Parrot
contact_phone_number = {{ lead.whatsapp SEM o 55 }}     // ⚠️ strip 55
contact_email        = {{ state.email | opcional }}
opt_in               = {{ state.opt_in }}
opt_in_ip            = {{ state.opt_in_ip }}
opt_in_signer_name   = {{ state.opt_in_signer_name }}
```
⚠️ **Strip do 55:** `whatsapp` vem `5541998369582`; enviar `41998369582`. Ex.: `String(whatsapp).replace(/^55/, '')`.

### 4.4 Nó "Carimbo" (Postgres UPDATE) — atrás do IF

Só roda se `ok && loan_request_id` (nunca carimba create que falhou). `WHERE` pelo `id` (uuid) do lead que o fluxo já conhece:

```sql
UPDATE agent_leads
SET metadata = metadata || jsonb_build_object(
      'loan_request_id', ({{ $json.loan_request_id }})::int,
      'fiserv_status', 'in_progress',
      'fiserv_requested_at', now())
WHERE id = '{{ lead.id }}';
```
O `||` faz **merge** — preserva o metadata existente (cnpj, source, cta_link, campaign_id, razao_social) e só adiciona as chaves Fiserv. O carimbo é o que liga a fase síncrona ao poller/webhook (é a chave que eles varrem).

### 4.5 Posicionamento na arquitetura (Two-Tier)

Este ramo vive **depois do Roteador, no lado determinístico** (não na geração de resposta da LLM) — igual ao padrão do Boleto. A LLM coleta e narra; o código orquestra a chamada e o carimbo. A LLM nunca "decide" criar o lead.

---

## 5. Jornada conversacional (fluxo principal)

Sequência completa, mapeada aos primitivos existentes (Two-Tier V68, Gatekeeper 10.6, agent_tools, Parrot, anti-alucinação):

1. **Entrada** — intent `SIMULATION_REQUEST` (já classificado pelo Roteador Semântico V67). O ramo que hoje envia o `cta_link` passa a iniciar a jornada.
2. **Gatekeeper (CNPJ = `access_key`)** — crédito é intent `protected`. O Gatekeeper coleta/valida o CNPJ (casa com o lead da campanha no `agent_leads` do tenant), ativa `conversation_security_session`, devolve controle com as ferramentas financeiras liberadas. (Padrão 10.6 já existente — apenas apontar crédito pra ele.)
3. **Coleta Parrot** — `revenue` (faturamento), `requested_amount` (valor), `opt_in` (consentimento LGPD). Passos obrigatórios → modo Parrot.
4. **`create_lead`** (seção 4) → **carimbo**.
5. **Resposta Parrot "avaliando ~1 min"** — fecha o turno sem travar.
6. **[assíncrono]** webhook/poller detecta decisão → **outbound apresenta a oferta**.
7. **`simulate`** — `query` tool que a LLM pode chamar para variações (envelope ≤ limite, 6–24x).
8. **`confirm`** — passo travado em Parrot, com idempotência. É o "contratar".

### 5.1 Registro como `agent_tools`

- `create_lead` → `action` (disparado pelo Roteador, não pela LLM)
- `confirm` → `action` (Parrot-locked)
- `simulate` → `query` (read-only, a LLM pode chamar)
- coleta de CNPJ → `access_key` (ativa a sessão de segurança)

### 5.2 Apresentação da oferta (anti-alucinação V68)

A LLM **nunca inventa número**. Os valores de `offer_data`/`simulation_data` entram como **placeholders injetados por código** (mesmo padrão do `{{lead_info.link}}`), e a LLM só narra. Campos a renderizar: `VlrParcela`, `PercJurosMensal`/`PercJurosAnual`, `PercCETMensal`/`PercCETAnual`, `VlrTotalCredito`, `VlrTotalDivida`, `VlrIOF`, `VlrTAC`, + `amount` e `installments` do `get_result`.

---

## 6. Poller `Poller Fiserv Credito`

Arquivo: `Poller_Fiserv_Credito.json` · worker autônomo (Schedule Trigger). **Rede de segurança** do webhook (cadência baixa: **30 min**, recomendação da Fiserv). NÃO é tool. Reusa o subworkflow.

### 6.1 Cadeia de nós

```
Ciclo (cron) → Ler leads pendentes (Postgres) → Montar consulta (action=get_result)
  → Ferramenta Fiserv (Execute Workflow) → Classificar resultado
  → Atualizar status no DB (Postgres) → Decidido? (IF)
       ├─ true  → Montar outbound → --> handle_outbound_sent (CONECTAR)
       └─ false → Aguardar proximo ciclo
```

### 6.2 Query de leitura (schema real)

```sql
SELECT id, tenant_id, identifier AS cnpj, whatsapp AS phone,
       (metadata->>'loan_request_id') AS loan_request_id
FROM agent_leads
WHERE metadata->>'fiserv_status' IN
      ('in_progress','fail_to_contact','contact_updated','comite','in_quoting','comite_approved','formalization')
  AND metadata->>'loan_request_id' IS NOT NULL
  AND (metadata->>'fiserv_offer_sent') IS DISTINCT FROM 'true'         -- idempotência
  AND (metadata->>'fiserv_requested_at')::timestamptz > now() - interval '2 days'  -- TTL anti-fila-infinita
LIMIT 100;
```

### 6.3 Classificar resultado (Code)

```
status pertence a:
  APPROVED = [approved, in_quoting, comite, comite_approved, formalization, won] → outcome=offer
  DENIED   = [denied, fails_to_process, lost, cancelled]                         → outcome=rejected
  senão                                                                          → outcome=pending
decided = outcome != 'pending'
```
Recupera a linha original via `$('Montar consulta').item` (carrega `_row_id`, `_tenant_id`, `_phone`).

### 6.4 Update por ciclo (merge)

```sql
UPDATE agent_leads
SET metadata = metadata
   || jsonb_build_object('fiserv_status', '{{ $json.status }}'::text)
   || jsonb_build_object('fiserv_external_status', '{{ ($json.external_status || "") }}'::text)
WHERE metadata->>'loan_request_id' = '{{ $json.loan_request_id }}';
```

### 6.5 Otimização para escala (`batch_status`)

O poll atual chama o subworkflow **1x por lead** → 1 login por lead. Para volume Edenred, adicionar uma ação `batch_status` no subworkflow: `{ action:'batch_status', cnpjs:[...] }` → **1 login** → loop interno → array `[{loan_request_id, status, offer_data}]`. O poller passa a chamar 1x por ciclo. Migrar quando o volume justificar.

### 6.6 Credenciais

Credencial Postgres do n8n: **"Postgres account - Agentes IA supabase - west"**.

---

## 7. Receptor de Webhook `Receptor Webhook Fiserv`

Arquivo: `Receptor_Webhook_Fiserv.json`. Caminho **primário** (evento em tempo real). O poller é a rede de segurança.

### 7.1 Infra (já implementada — V70.1)

- **Rota White-Label no Porteiro:** `POST https://api.davosconsulting.com.br/v1/edenred/status` (esconde n8n e o domínio interno).
- **Autenticação na borda:** o Porteiro valida `Authorization: Bearer <EDENRED_API_TOKEN>` (401 ~2ms se inválido). **O token NÃO chega ao n8n** (é consumido na borda).
- **Forwarding:** o payload íntegro é repassado para `EDENRED_N8N_WEBHOOK` (interno, ex.: `n8n.../webhook/edenred-status`).
- **n8n webhook auth = None** (confiança atestada na borda).
- Validado: POST chega ao n8n com corpo íntegro, `executionMode: production`.

### 7.2 Miolo a construir (depende da doc da Fiserv)

Atrás do mesmo Webhook Trigger (URL não muda):
```
Webhook → (validar payload) → Ferramenta Fiserv (action=get_result, confirma o status real)
        → Carimbo (UPDATE metadata) → Decidido? → Montar outbound → handle_outbound_sent
```
**Princípio de segurança:** o webhook é só um **gatilho**; a verdade vem da API. Mesmo que o payload traga `offer_data`, confirmar via `get_result` antes de disparar a oferta (protege contra payload forjado).

### 7.3 Payload esperado (mínimo)

Para atualizar status, o indispensável é **`loan_request_id` + `status`**. O resto (offer_data, cnpj) é buscado via `get_result` (o vínculo `loan_request_id`↔CNPJ já está no `metadata`). Confirmar na doc: nomes exatos dos campos, eventos que disparam, retry.

### 7.4 Núcleo compartilhado (refator recomendado)

Webhook e poller fazem a **mesma coisa** por gatilhos diferentes (`get_result → carimbar → decidir outbound`). Recomendado extrair esse miolo num **subworkflow comum** que ambos chamam, evitando duplicar a regra. Pode começar inline no receptor e fatorar depois.

### 7.5 Pendência de auth com a Fiserv

Como o Porteiro exige `Authorization: Bearer`, **a Fiserv precisa conseguir enviar esse header fixo**. Se a plataforma deles não permitir header customizado, alinhar outro mecanismo (HMAC no corpo, IP allowlist). Item da doc/alinhamento.

---

## 8. Banco de dados (`agent_leads.metadata`)

### 8.1 Schema (real, confirmado)

```sql
create table public.agent_leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references companies(id),
  campaign_id uuid references campaigns(id) on delete cascade,
  identifier varchar(50) not null,        -- CNPJ
  identifier_type varchar(20) default 'cnpj',
  name text,
  whatsapp varchar(20),                    -- com prefixo 55
  cta_link text,
  status varchar(20) default 'pending',
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  unique (tenant_id, identifier)
);
```
Não há colunas Fiserv dedicadas — tudo vai no `metadata`.

### 8.2 Chaves Fiserv no `metadata`

| chave | quando | exemplo |
|---|---|---|
| `loan_request_id` | no create (carimbo) | `6762` |
| `fiserv_status` | create + cada ciclo do poller/webhook | `in_progress` → `approved` |
| `fiserv_external_status` | cada ciclo | `Pré-aprovado` |
| `fiserv_requested_at` | no carimbo | timestamptz |
| `fiserv_offer_sent` | ao disparar o outbound (idempotência) | `true` |

---

## 9. Isolamento multi-tenant e ambientes

### 9.1 Isolamento (V70.1, já implementado)

- `fn_fetch_next_inbound_message(p_tenant_id)`: cada instância/fluxo n8n consome **apenas** mensagens do seu tenant.
- **Tenant de teste dedicado** + canal **Evolution API** (oficial = Zenvia). Canais fisicamente separados → lojista real não cai no teste.
- O Porteiro roteia por tenant **antes** de bifurcar para o fluxo correto.

### 9.2 Regra crítica do banco compartilhado

Banco é único (sem réplica separada para teste). Por isso: **toda escrita do fluxo novo deve ser escopada pelo tenant de teste** (`WHERE tenant_id = <tenant_teste>` ou valores do tenant). Varredura obrigatória: nenhuma query do fluxo novo pode rodar sem filtro de tenant. Tabelas globais (sem `tenant_id`) são o ponto de atenção.

### 9.3 Sandbox vs produção (virada)

- Fluxo novo usa **sandbox** durante todo o teste.
- Virada da Fiserv = trocar `$('VARS')` → `$env.FISERV_*` (apontando produção) e apagar o VARS. Como nenhum tenant real usa a jornada nativa antes do go-live, a troca é segura.

---

## 10. Telemetria / funil (consequência obrigatória)

A RPC `get_edenred_conversion_funnel` hoje conta **"Link Enviado"** buscando `%fiservcapital%` nas mensagens. **Sem link enviado, essa métrica para de contar.** Atualizar os marcos do funil para a jornada nativa:

| Marco antigo | Marco novo |
|---|---|
| Link Enviado (`%fiservcapital%`) | **Crédito Solicitado** (`create_lead` ok / carimbo) |
| — | **Oferta Apresentada** (outbound de oferta) |
| — | **Contratado** (`confirm` ok) |

Sem isso, o dashboard da Edenred zera silenciosamente.

---

## 11. Sequência de implementação

1. Tudo no **fluxo novo / tenant de teste** (já isolado).
2. **Branch de crédito** (seção 4 e 5): entrada → Gatekeeper CNPJ → coleta Parrot → `create_lead` → carimbo → "avaliando".
3. **Validar fase síncrona** pelo número de teste (Evolution) + Fiserv sandbox (CNPJ novo → 201 → carimbo).
4. **Miolo do receptor de webhook** (quando a doc chegar) + **outbound** da oferta.
5. **`simulate` / `confirm`** + apresentação completa.
6. **Atualizar o funil** + registrar **V71** no doc de arquitetura.
7. **Poller** ativo como rede de segurança (30 min).
8. **Cutover** (seção 12).

---

## 12. Checklist de cutover

- [ ] Subworkflow: `$('VARS')` → `$env.FISERV_*`, base URL de produção, VARS apagado.
- [ ] Branch `create_lead` no fluxo principal + carimbo (com strip-55 e guarda de idempotência).
- [ ] Toda query do fluxo novo escopada por tenant (varredura concluída).
- [ ] Subworkflow chamado pelo fluxo novo cravado no ambiente correto (sandbox em teste; prod no go-live).
- [ ] Receptor de webhook com miolo + auth confirmada com a Fiserv.
- [ ] `handle_outbound_sent` conectado + idempotência (`fiserv_offer_sent`).
- [ ] Funil (`get_edenred_conversion_funnel`) atualizado para os novos marcos.
- [ ] Poller ativo (30 min) + TTL de lead preso.
- [ ] **Plano de rollback escrito:** fechar o gate por tenant / desativar o fluxo novo / restaurar o backup.
- [ ] Rate limit de create calibrado com a Fiserv para o volume previsto.
- [ ] Leads de teste/tenant de teste não contaminam relatórios do oficial.

---

## 13. Itens abertos (dependências externas)

| Item | Status | Quem |
|---|---|---|
| Doc do webhook (payload, eventos, retry) | aguardando | Fiserv |
| Fiserv consegue enviar header `Authorization: Bearer`? | a confirmar | Fiserv |
| Calibração do rate limit de create | acompanhamento incremental | Fiserv (Marcos) |
| Cache de 30 dias configurável | só se necessário | Fiserv (Marcos) |
| Massa de testes aprovada (sandbox) | ✅ recebida | — |

---

## Apêndice A — Massa de testes (sandbox)

Estados (validados):

| loan_request_id | CNPJ | status | offer_data |
|---|---|---|---|
| 6780 | 14638312000130 | comite_approved | populado |
| 6779 | 35751750000180 | approved | populado |
| 6778 | 36417284000163 | cancelled | vazio |
| 6782 | 48283530000110 | won | populado |
| 6777 | 51768779000120 | lost | vazio |
| 6776 | 59651394000190 | denied | vazio |
| 6781 | 66437697000170 | formalization | populado |
| 6784 | 83191944000110 | fail_to_contact | populado |

Simulação (envelope: amount ≤ 50.000, installments 6–24):

| loan_request_id | CNPJ |
|---|---|
| 6794 | 03966066000129 |
| 6795 | 22183291000133 |
| 6796 | 81533570000149 |

Exemplo `simulation_data` (6794, 50.000 em 12x): `VlrParcela 5224.44, PercJurosMensal 2.75, PercCETMensal 3.66`.

## Apêndice B — Variáveis de ambiente

| Variável | Onde | Uso |
|---|---|---|
| `FISERV_BASE_URL` | n8n `$env` (prod) / VARS (teste) | base da API |
| `FISERV_EMAIL` | n8n `$env` / VARS | login |
| `FISERV_PASSWORD` | n8n `$env` / VARS | login |
| `EDENRED_API_TOKEN` | Porteiro | Bearer da rota white-label |
| `EDENRED_N8N_WEBHOOK` | Porteiro | destino interno do forward |

> Segredos (senha sandbox, EDENRED_API_TOKEN) são compartilhados por canal seguro, fora deste documento. O token exposto durante os testes deve ser **rotacionado** antes da produção.

---

*Fim do handoff. Artefatos n8n de referência: `Ferramenta_Fiserv_Credito.json`, `Poller_Fiserv_Credito.json`, `Receptor_Webhook_Fiserv.json`.*
