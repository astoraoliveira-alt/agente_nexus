# SPEC — Captura de Opt-in (Consentimento LGPD) na Jornada de Crédito Fiserv

Para: implementação (Antigravity).
Escopo: inserir a **captura de consentimento LGPD** na jornada de crédito nativa, hoje ausente. Toca dois pontos do fluxo principal n8n (`Agente Nexus - Whatts Fila [FISERV TICKET][TESTE]`): o nó **`Roteador de Contexto`** (Code, máquina de estados V19) e o nó **`Set (Prepara Fiserv)`**.

> ⚠️ Texto e fluxo de consentimento devem ser validados pelo jurídico/compliance. Esta spec descreve a mecânica que torna o consentimento **informado, específico, afirmativo e auditável**.

---

## 1. Problema atual

1. No `Set (Prepara Fiserv)`, o campo **`opt_in` está fixo em `true`** (hardcoded), com `opt_in_signer_name` = nome do lead e `opt_in_ip` = header. O sistema afirma um consentimento que o lojista **nunca deu**.
2. Na máquina de estados do `Roteador de Contexto`, a transição é direta: `verificacao_cnpj` (confirmação de **identidade**) → `criar_lead`. **Não há etapa de consentimento.** O texto oficial de autorização da Fiserv (acesso à Agenda de Recebíveis, consulta SCR/Bacen, Serasa) **nunca é exibido**.

Confirmar identidade ("sou o responsável pelo CNPJ") **não é** consentir o acesso aos dados financeiros. São dois momentos distintos.

---

## 2. Mudança na máquina de estados (nó `Roteador de Contexto`)

Inserir um novo estado **`consentimento_optin`** entre `verificacao_cnpj` e `criar_lead`, e um estado de saída **`optin_recusado`**. Seguir o padrão já usado no código (blocos de detecção de `currentStep`, de transição de `nextStep`, e de `forcedText`).

### 2.1 Detecção de `currentStep` (bloco que lê `lastSofiaMsg`)

Adicionar **antes** do bloco de `verificacao_cnpj` (a ordem importa: este texto é mais específico). Detectar pela frase-âncora da mensagem de consentimento:

```js
} else if (lastSofiaMsg.includes("autorização à fiserv") || lastSofiaMsg.includes("responda *autorizo*") || lastSofiaMsg.includes("para autorizar e seguir")) {
    currentStep = 'consentimento_optin';
}
```

### 2.2 Transição de `nextStep`

**Alterar** a transição existente de `verificacao_cnpj`: ela deixa de ir direto para `criar_lead` e passa a ir para `consentimento_optin`.

```js
// ANTES (V19):
} else if (currentStep === 'verificacao_cnpj') {
    if (isAffirmative && !isDoubt) {
        nextStep = 'criar_lead';            // <-- REMOVER
        transitionApplied = true;
    } else if (isNegative && !isDoubt) {
        nextStep = 'coleta_cnpj_correto';
        transitionApplied = true;
    }
}

// DEPOIS:
} else if (currentStep === 'verificacao_cnpj') {
    if (isAffirmative && !isDoubt) {
        nextStep = 'consentimento_optin';   // <-- exibe o texto LGPD e pede AUTORIZO
        transitionApplied = true;
    } else if (isNegative && !isDoubt) {
        nextStep = 'coleta_cnpj_correto';
        transitionApplied = true;
    }
}
```

**Adicionar** a transição do novo estado. O aceite tem que ser explícito (ver 3 — gating mais estrito que o `isAffirmative` genérico):

```js
} else if (currentStep === 'consentimento_optin') {
    if (isOptInAccepted) {                  // ver definição em 3.1
        nextStep = 'criar_lead';            // só aqui cria o lead
        transitionApplied = true;
    } else if (isNegative && !isDoubt) {
        nextStep = 'optin_recusado';
        transitionApplied = true;
    } else {
        nextStep = 'consentimento_optin';   // resposta ambígua → re-pergunta
        transitionApplied = true;
    }
}
```

### 2.3 `forcedText` dos novos estados

Adicionar dois blocos `else if` na seção de `forcedText` (onde já existe o `else if (nextStep === 'criar_lead')`):

```js
} else if (nextStep === 'consentimento_optin') {
    forcedText = `Perfeito, ${leadInfo.name || "parceiro"}! ✅\n\nPara a *Fiserv* analisar seu crédito, ela precisa da sua autorização para consultar seus recebíveis e informações de crédito. Segue a autorização:\n\n${OPTIN_TEXT_OFICIAL}\n\nPara autorizar e seguir com a análise, responda *SIM*, *ACEITO* ou *AUTORIZO*. Se preferir não seguir agora, é só me avisar.`;
} else if (nextStep === 'optin_recusado') {
    forcedText = `Sem problema, ${leadInfo.name || "parceiro"}. Gostaríamos de reforçar que só podemos seguir com a análise de crédito se você aceitar a pesquisa pela Fiserv. Se mudar de ideia, é só me chamar aqui que retomamos. 👍`;
}
```

O `OPTIN_TEXT_OFICIAL` é o texto enviado pela Fiserv (ver Anexo A). Deve ir **inteiro, inline** — não como link (o consentimento é àquele texto exibido; link enfraquece a prova de leitura).

> O `criar_lead` permanece como está (mensagem "Vou enviar suas informações agora para a Fiserv...") — só passa a ser alcançado **depois** do consentimento.

---

## 3. Captura e gating do consentimento

### 3.1 Aceite explícito (`isOptInAccepted`)

Não reusar o `isAffirmative` genérico (que casa "ok", "beleza", "pode", etc.). Consentimento exige aceite claro. Definir:

```js
const isOptInAccepted = /\b(autorizo|sim,?\s*autorizo|sim|concordo|aceito|de acordo)\b/i.test(lastUserLower) && !/\b(n[ãa]o)\b/i.test(lastUserLower);
```

Registrar **sempre o texto exato** que o usuário digitou (verbatim), independente da palavra usada.

### 3.2 Dados de consentimento a capturar (no turno do aceite)

No turno em que `currentStep === 'consentimento_optin'` e `isOptInAccepted === true`, montar o registro de consentimento e propagá-lo no contexto/saída do roteador para o `Set (Prepara Fiserv)` consumir:

| Campo | Origem |
|---|---|
| `opt_in` | `true` (só quando aceito) |
| `opt_in_timestamp` | timestamp da mensagem de aceite do usuário (ISO-8601 com timezone) |
| `opt_in_signer_name` | nome do responsável (confirmado na etapa de identidade); fallback `leadInfo.name` |
| `opt_in_ip` | IP real da origem |
| `consent_channel` | `"whatsapp"` |
| `consent_phone` | telefone do usuário |
| `consent_text_version` | `"v1-2026-06"` (versão do texto exibido) |
| `consent_text_hash` | `sha256` do `OPTIN_TEXT_OFICIAL` exibido |
| `confirmation_message` | texto verbatim do aceite (ex.: `"AUTORIZO"`) |
| `confirmation_message_id` | `wamid` da mensagem do usuário (id WhatsApp), se disponível |

---

## 4. Mudança no nó `Set (Prepara Fiserv)`

Remover o hardcode e usar o consentimento capturado:

```diff
- opt_in              = true                              (boolean fixo)
- opt_in_ip           = x-forwarded-for || '0.0.0.0'
- opt_in_signer_name  = leadInfo.name || 'Cliente'
+ opt_in              = {{ consentimento aceito ? true : (NÃO criar) }}
+ opt_in_timestamp    = {{ consent.opt_in_timestamp }}    // momento do AUTORIZO, não o now() do create
+ opt_in_ip           = {{ consent.opt_in_ip }}
+ opt_in_signer_name  = {{ consent.opt_in_signer_name }}
```

Os demais campos (`registration_code`, `contact_name`, `contact_phone_number` com strip-55) permanecem.

> **Gate duro:** se o consentimento não foi aceito, o ramo `criar_lead` **não deve ser alcançado** (a máquina de estados já garante isso — `criar_lead` só vem de `consentimento_optin` + aceite). Como defesa em profundidade, o `Set`/switch pode validar `opt_in === true` antes de chamar `create_lead`.

---

## 5. Persistência do consentimento (prova/auditoria)

Gravar o registro junto ao carimbo (nó `Postgres Carimbo`), no `metadata` do lead, sob uma chave `consent`:

```sql
UPDATE agent_leads
SET metadata = metadata || jsonb_build_object(
    'loan_request_id', {{ loan_request_id }}::int,
    'fiserv_status', 'in_progress',
    'fiserv_requested_at', now(),
    'consent', jsonb_build_object(
        'opt_in', true,
        'timestamp', '{{ consent.opt_in_timestamp }}',
        'ip', '{{ consent.opt_in_ip }}',
        'signer_name', '{{ consent.opt_in_signer_name }}',
        'channel', 'whatsapp',
        'phone', '{{ consent.consent_phone }}',
        'text_version', '{{ consent.consent_text_version }}',
        'text_hash', '{{ consent.consent_text_hash }}',
        'confirmation_message', '{{ consent.confirmation_message }}',
        'confirmation_message_id', '{{ consent.confirmation_message_id }}'
    )
)
WHERE identifier = '{{ cnpj }}' AND tenant_id = '{{ tenant_id }}'::uuid;
```

O mesmo registro vai à Fiserv nos campos `opt_in_*` do `create_lead` (ver e-mail/spec de evento). O `text_version`/`text_hash` permite provar **qual** versão do texto cada lojista consentiu, mesmo que o texto mude no futuro.

---

## 6. Critérios de aceite (casos de teste)

1. Usuário confirma identidade (`verificacao_cnpj`) → recebe o **texto oficial** + pedido de AUTORIZO; **lead NÃO é criado** ainda.
2. Usuário responde "AUTORIZO" → lead criado **com** `opt_in=true` e `opt_in_timestamp` = momento do aceite; consentimento gravado em `metadata.consent`.
3. Usuário responde "não" / recusa → estado `optin_recusado`; **lead NÃO criado**; `opt_in` nunca vira true.
4. Resposta ambígua no passo de consentimento → re-pergunta (não cria).
5. `Set (Prepara Fiserv)` nunca envia `opt_in=true` sem registro de consentimento correspondente.
6. `consent_text_hash` corresponde ao hash do texto exibido.

---

## Anexo A — Texto oficial de opt-in (Fiserv) · versão `v1-2026-06`

> Inserir como string `OPTIN_TEXT_OFICIAL`. Exibir inline, verbatim.

```
O (Cliente/Estabelecimento) CONFERE E OUTORGA autorização à Fiserv Sociedade de Crédito Diretos S.A., sociedade com sede na Av. das Nações Unidas, 14.171, Condomínio Rochaverá Corporate Towers, Bloco Marble, 9º andar, Brooklin Novo, São Paulo - SP, CEP 04794-000, inscrita no CNPJ/MF sob o nº 50.053.267/0001-15 (“Fiserv”), bem como aos seus parceiros de negócio, de forma irrevogável e irretratável, para:(i) Acessar a sua Agenda de Recebíveis em Entidades Registradoras, inclusive junto a outras instituições de pagamento ou instituições financeiras que prestem serviços de credenciamento ao (Cliente/Estabelecimento), com a finalidade de identificar Unidades de Recebíveis que não estejam sujeitas a ônus, gravames ou restrições de cessão de qualquer natureza;(ii) Consultar e compartilhar informações junto ao Sistema de Informações de Crédito (SCR) do Banco Central do Brasil, bem como junto a bureaus de crédito, incluindo mas não se limitando à SERASA, para fins de análise de crédito, avaliação de risco e conformidade regulatória; (iii) Tratar os dados pessoais e financeiros do (Cliente/Estabelecimento) em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 - LGPD), garantindo a segurança, confidencialidade e uso adequado das informações, exclusivamente para os fins aqui autorizados. O (Cliente/Estabelecimento) declara e se responsabiliza que a autorização ora concedida foi firmada por representante legal devidamente habilitado, sob pena de incorrer em responsabilidade civil pelos prejuízos decorrentes da eventual ausência de poderes.
```

> Substituir "(Cliente/Estabelecimento)" pelo nome do estabelecimento na exibição, se o jurídico aprovar; senão manter o placeholder.

---

## Resumo das alterações

| Onde | Mudança |
|---|---|
| `Roteador de Contexto` — detecção | novo `currentStep = 'consentimento_optin'` |
| `Roteador de Contexto` — transição | `verificacao_cnpj` → `consentimento_optin` (não mais direto a `criar_lead`); novo `consentimento_optin` → `criar_lead`/`optin_recusado` |
| `Roteador de Contexto` — forcedText | textos de `consentimento_optin` e `optin_recusado` |
| `Roteador de Contexto` — captura | `isOptInAccepted` + registro de consentimento |
| `Set (Prepara Fiserv)` | `opt_in` condicional + timestamp/ip/signer reais |
| `Postgres Carimbo` | grava `metadata.consent` |

---

## 7. Formato do Payload de Consentimento para a Fiserv

Em resposta à solicitação da Fiserv por um exemplo da estrutura do dado para o Opt-In, a implementação deve enviar estes dados no request de `create_lead` (ou num webhook/evento específico, conforme a Fiserv estruturar a API):

```json
{
  "opt_in": true,
  "opt_in_timestamp": "2026-06-22T15:30:00-03:00",
  "opt_in_ip": "177.100.200.50",
  "opt_in_signer_name": "João da Silva (nome do contato)",
  "opt_in_metadata": {
    "consent_channel": "whatsapp",
    "consent_phone": "5511999999999",
    "consent_text_version": "v1-2026-06",
    "consent_text_hash": "c8b21... (sha256 do texto exibido)",
    "confirmation_message": "SIM",
    "confirmation_message_id": "wamid.HBg..."
  }
}
```
*Observação: A Fiserv deverá validar se os campos adicionais do metadata (canal, hash da versão, mensagem do cliente, etc.) devem estar no próprio JSON root ou encapsulados como no exemplo.*
