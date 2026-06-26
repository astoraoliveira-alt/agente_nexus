import json

def generate_guide():
    main_path = 'database/json n8n/Agente Nexus - Whatts Fila (FISERV_TICKET) TESTE (2).json'
    guide_path = '/Users/user/.gemini/antigravity-ide/brain/d07fb7b1-9b55-48b2-b0ff-6e152a6079c6/manual_n8n_guide.md'

    with open(main_path, 'r', encoding='utf-8') as f:
        main_flow = json.load(f)

    roteador_node = next(n for n in main_flow['nodes'] if n['name'] == 'Roteador de Contexto')
    js_code = roteador_node['parameters']['jsCode']

    content = """# Guia de Configuração Manual no n8n - Jornada Nativa Fiserv (Sofia)

Este guia detalha de forma prática e direta como configurar e validar manualmente os nós dos fluxos do n8n para a análise de crédito nativa da Fiserv com a assistente Sofia.

Ele cobre:
1. O fluxo de captação de dados (fluxo principal).
2. O fluxo receptor do webhook de status enviado pela Fiserv.

---

# 📲 PARTE 1: Configuração no Fluxo Principal (Conversacional)

## 🧭 Nó 1: Roteador de Contexto
- **Tipo de Nó:** Code (JavaScript)
- **Nome do Nó:** `Roteador de Contexto`
- **Ação:** Substitua todo o código JavaScript existente neste nó pelo código abaixo.
- **Função:** Este código analisa o histórico da conversa, detecta a transição para `criar_lead` (que dispara o Switch determinístico), extrai faturamento (revenue) e valor do empréstimo (requested_amount), normaliza e mapeia o telefone e monta as variáveis que serão enviadas para a cotação da Fiserv.

### 💻 Código JavaScript Completo do Roteador:
```javascript
{js_code}
```

---

## 🛠️ Nó 2: Roteia Criacao Lead
- **Tipo de Nó:** Switch
- **Nome do Nó:** `Roteia Criacao Lead`
- **Propriedades a configurar:**
  - **Data Type:** `String`
  - **Value 1:** `{{ $json.currentStep }}`
  - **Rules:**
    - **Rule 0:** Se for igual a (`equals`) `criar_lead`
  - **Fallback Output:** `1` (Representa o roteamento padrão para a LLM / RAG)

---

## 🛠️ Nó 3: Set (Prepara Fiserv)
- **Tipo de Nó:** Set
- **Nome do Nó:** `Set (Prepara Fiserv)`
- **Ações / Mapeamentos (Ajuste o telefone com strip-55):**
  - `action`: `create_lead` (string)
  - `registration_code`: `{{ $json.lead_info.cnpj || $json.leadInfo?.cnpj }}` (string)
  - `contact_phone_number`: `{{ ($json.lead_info.phone || $('Roteador de Contexto').first().json.lead_info?.phone || '').replace(/^55/, '') }}` (string)
  - `revenue`: `{{ $json.lead_info.revenue || $('Roteador de Contexto').first().json.lead_info?.revenue }}` (string)
  - `requested_amount`: `{{ $json.lead_info.requested_amount || $('Roteador de Contexto').first().json.lead_info?.requested_amount }}` (string)
  - `opt_in`: `true` (boolean)

---

# 🔔 PARTE 2: Configuração no Receptor Webhook Fiserv

## 🛡️ Nó 1: Atualizar status no DB
- **Tipo de Nó:** Postgres
- **Nome do Nó:** `Atualizar status no DB`
- **Type Version:** `2.6` (ou superior)
- **Operação:** `Execute Query`
- **SQL Query (com isolamento por tenant_id):**
```sql
UPDATE agent_leads
SET metadata = metadata
   || jsonb_build_object('fiserv_status', '{{ $json.status }}'::text)
   || jsonb_build_object('fiserv_external_status', '{{ ($json.external_status || "") }}'::text)
   || (CASE WHEN '{{ $json.decided }}' = 'true' THEN jsonb_build_object('fiserv_offer_sent', 'true') ELSE '{}'::jsonb END)
WHERE id = '{{ $json.lead_id }}'
  AND tenant_id = '{{ $json.tenant_id }}'::uuid;
```

---

## ⚖️ Nó 2: Decidido?
- **Tipo de Nó:** IF
- **Nome do Nó:** `Decidido?`
- **Condições:**
  - `{{ $json.decided }}` é igual a `true` (boolean)
- **Conexões:**
  - Saída **true** -> Conecta no nó `Inserir Outbound Queue`
  - Saída **false** -> Conecta no nó `Aguardar proximo ciclo`

---

## 🗃️ Nó 3: Inserir Outbound Queue
- **Tipo de Nó:** Postgres
- **Nome do Nó:** `Inserir Outbound Queue`
- **Operação:** `Execute Query`
- **SQL Query (insere na fila de disparos ativos com escape de aspas simples):**
```sql
INSERT INTO public.outbound_queue (
  tenant_id,
  agent_id,
  campaign_id,
  contact_name,
  contact_phone,
  status,
  metadata
) VALUES (
  '{{ $json.tenant_id }}'::uuid,
  '{{ $json.agent_id }}'::uuid,
  {{ $json.campaign_id ? "'" + $json.campaign_id + "'::uuid" : "NULL" }},
  '{{ $json.contact_name.replace(/'/g, "''") }}',
  '{{ $json.contact_phone }}',
  'pending',
  jsonb_build_object(
    'content', '{{ $json.message_content.replace(/'/g, "''") }}',
    'message', '{{ $json.message_content.replace(/'/g, "''") }}',
    'offer_data', '{{ JSON.stringify($json.offer_data || {}) }}'::jsonb
  )
)
ON CONFLICT (campaign_id, contact_phone)
DO UPDATE SET
  status = 'pending',
  metadata = EXCLUDED.metadata,
  scheduled_at = NOW(),
  created_at = NOW();
```
""".replace('{js_code}', js_code)

    with open(guide_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("manual_n8n_guide.md generated successfully!")

if __name__ == '__main__':
    generate_guide()
