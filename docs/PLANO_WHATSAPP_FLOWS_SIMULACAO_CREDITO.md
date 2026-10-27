# 📋 Plano de Implementação: Formulário Nativo de Simulação via WhatsApp Flows (Zenvia & Meta)

> **Objetivo:** Substituir as 3 perguntas sequenciais de chat (Valor Desejado, Faturamento Mensal e Aceite do Opt-in) por uma experiência de **WhatsApp Flow nativo**, aumentando a taxa de conclusão do funil e garantindo conformidade regulatória plena com o BACEN e LGPD.

---

## 1. Contexto e Justificativa de Negócio

### O Cenário Atual (Chat Tradicional de 6 Turnos)
Hoje, para que o lead chegue até a análise de crédito da Fiserv, a Sofia e o cliente precisam trocar no mínimo **6 mensagens consecutivas**:
1. *Sofia pergunta o Valor Desejado* ➔ *Cliente digita o valor*
2. *Sofia pergunta o Faturamento Médio Mensal* ➔ *Cliente digita o faturamento*
3. *Sofia envia o Termo Legal + Botão "SIM, AUTORIZO"* ➔ *Cliente clica no botão*

### Gargalo Identificado nos Dados
* **34,9% dos leads** que iniciam a qualificação desistem antes do Opt-in devido à fricção de digitação, ambiguidades nas respostas ("varia", "em torno de 40 a 50k") ou hesitação em responder perguntas separadas.

### A Solução com WhatsApp Flows
* O cliente clica no botão oficial da campanha matinal (**`[ Quero Simular! ]`** ou *"Falar com especialista"*), abrindo a **janela de atendimento de 24 horas**.
* A Sofia envia **1 mensagem interativa com botão `[ Simular crédito ]`**.
* Ao tocar no botão, abre-se uma tela nativa e moderna dentro do WhatsApp (sem abrir navegador externo).
* O cliente preenche o valor, seleciona o faturamento, confere o termo e clica em **Enviar**.
* O funil vai de **6 turnos de espera para 1 único toque**.

---

## 2. Arquitetura do Flow & Versionamento

Os arquivos com a especificação técnica completa estão versionados no diretório [`flows/`](file:///Users/user/SaaS%20-%20Davos%20Nexus/agent-nexus-hub/flows/):
* 👉 [`flows/simulacao_credito_v2.json`](file:///Users/user/SaaS%20-%20Davos%20Nexus/agent-nexus-hub/flows/simulacao_credito_v2.json) — **Versão 2.0 (Recomendada / Padrão Oficial Meta):** Tela única de alta conversão, com abertura direta do PDF oficial do termo via `open_url` e binding correto `${form.<campo>}`.
* 👉 [`flows/simulacao_credito_v2_duas_telas.json`](file:///Users/user/SaaS%20-%20Davos%20Nexus/agent-nexus-hub/flows/simulacao_credito_v2_duas_telas.json) — **Versão 2.0 (Duas Telas / Wizard):** Roteamento progressivo estrito para frente (`SIMULACAO_SCREEN -> TERMOS_SCREEN`), com os termos e o checkbox de autorização na segunda tela.
* 👉 [`flows/simulacao_credito_v1.json`](file:///Users/user/SaaS%20-%20Davos%20Nexus/agent-nexus-hub/flows/simulacao_credito_v1.json) — Arquivo histórico legado da v1.

### Tela Principal: `SIMULACAO_SCREEN` ("Simulação de crédito")
* **Título:** Simulação de crédito
* **Cabeçalho:** *Reforço de Caixa Ticket*
* **Subcabeçalho:** *Informe os valores abaixo para consultarmos as melhores taxas e limites pré-aprovados para sua empresa.*
* **Campo 1 — Valor Desejado:**
  * Componente: `TextInput`
  * Tipo: `input-type: number` (força o smartphone a abrir o teclado numérico)
  * Obrigatório: `true`
  * Helper text: `Digite só números. Ex.: 50000`
* **Campo 2 — Faturamento Médio Mensal:**
  * Componente: `Dropdown`
  * Obrigatório: `true`
  * O cliente visualiza a faixa amigável, mas o valor transmitido (`id`) é o **teto numérico** da faixa:

| ID Transmitido (Teto) | Rótulo Visível ao Cliente |
| :---: | :--- |
| `10000` | Até R$ 10 mil |
| `30000` | R$ 10 mil a R$ 30 mil |
| `50000` | R$ 30 mil a R$ 50 mil |
| `100000` | R$ 50 mil a R$ 100 mil |
| `250000` | R$ 100 mil a R$ 250 mil |
| `500000` | R$ 250 mil a R$ 500 mil |
| `1000000` | R$ 500 mil a R$ 1 milhão |

* **Campo 3 — Termo e Consentimento (Opt-in Digital):**
  * Componente: `OptIn`
  * Rótulo: *"Autorizo a consulta dos meus dados para análise de crédito (SCR/Bacen e registradoras)."*
  * Obrigatório: `true` (O cliente marca a caixa ativamente para poder enviar o formulário, em conformidade com as diretrizes da Meta/LGPD).
  * Link: Componente `EmbeddedLink` com texto *"Ler o termo completo (PDF oficial)"*, que executa `open_url` diretamente para o arquivo oficial.
* **Footer (Rodapé):**
  * Botão: **`[ Enviar Simulação ]`**
  * Ação: `complete`, retornando o payload padronizado:
    ```json
    {
      "valor_simulacao": "${form.valor_simulacao}",
      "faturamento_medio": "${form.faturamento_medio}",
      "consentimento": "${form.consentimento}"
    }
    ```

---

### Tela 2: `TERMOS_SCREEN` ("Termo de Consentimento")
> **Diferencial de UX:** Em vez de jogar o cliente para o navegador web ou forçar o download de um PDF externo (o que geraria abandono), o termo completo é exibido nativamente em uma tela secundária dentro do próprio WhatsApp.

* **Título:** Termo de Consentimento
* **Cabeçalho:** *Autorização de Consulta — Fiserv Sociedade de Crédito Direto S.A. & Ticket*
* **Texto Legal:** Conteúdo extraído na íntegra do documento oficial `termo-autorizacao-fiserv-v1-2026-06.pdf`:
  1. *Objeto da Autorização:* Acesso à Agenda de Recebíveis Ticket perante registradoras, consulta ao SCR/Bacen e bureaus de crédito, compartilhamento de informações para fins de crédito nos termos da Lei Complementar nº 105/2001 e conformidade integral com a LGPD.
  2. *Declaração do Cliente:* Representação legal habilitada.
  3. *Registro do Consentimento:* Armazenamento digital de data, hora, canal e identificador para fins de auditoria regulatória.
* **Link Opcional de Cópia Externa:** Link `EmbeddedLink` *"Baixar cópia do PDF"* apontando para a URL pública segura do termo.
* **Footer:** Botão **`[ Voltar para a Simulação ]`** (ação `navigate` que retorna à Tela 1 mantendo os campos já preenchidos).

---

## 3. Instruções para a Equipe da Zenvia

Quando a equipe da Zenvia solicitar os arquivos para publicação do Flow na linha **`551151183815`**, forneça as seguintes instruções:

1. **Arquivo do Flow:** Enviar o arquivo [`flows/simulacao_credito.json`](file:///Users/user/SaaS%20-%20Davos%20Nexus/agent-nexus-hub/flows/simulacao_credito.json);
2. **Nome do Flow sugerido:** `simulacao_credito_ticket_fiserv`;
3. **Categoria na Meta:** `LEAD_GENERATION` ou `CUSTOMER_SUPPORT`;
4. **Modo:** `Published`;
5. **O que a Zenvia precisa nos retornar:**
   * O número do **`flow_id`** (identificador numérico gerado pela Meta, ex: `748291038472910`).

---

## 4. Contrato de Integração na API Zenvia v2

### A. Envio do Flow pela Sofia (Outbound na Janela de 24h)
Logo após o lead clicar no botão *"Quero Simular!"* da campanha, a Sofia dispara a mensagem de sessão no endpoint oficial da Zenvia:

* **Endpoint:** `POST https://api.zenvia.com/v2/channels/whatsapp/messages`
* **Headers:**
  * `X-API-TOKEN: <ZENVIA_TOKEN>`
  * `Content-Type: application/json`
* **Payload:**
```json
{
  "from": "551151183815",
  "to": "{{ lead_phone }}",
  "contents": [
    {
      "type": "flow",
      "header": "Reforço de Caixa",
      "body": "Olá! Para prepararmos sua proposta exclusiva com taxas personalizadas pela Ticket, preciso de algumas informações rápidas. Toque abaixo:",
      "footer": "Ticket & Fiserv Capital",
      "flow": {
        "mode": "published",
        "token": "{{ lead_id }}",
        "id": "{{ FLOW_ID }}",
        "buttonText": "Simular crédito",
        "action": {
          "type": "navigate",
          "screen": "SIMULACAO_SCREEN",
          "data": {}
        }
      }
    }
  ]
}
```

### B. Recepção da Resposta no Webhook (Inbound da Zenvia)
Quando o cliente preenche o formulário e toca em "Enviar Simulação", a Zenvia entrega o seguinte evento no nosso webhook:

```json
{
  "id": "msg-flow-res-12345",
  "timestamp": "2026-10-26T15:30:00.000Z",
  "type": "MESSAGE",
  "subscriptionId": "sub-123",
  "channel": "whatsapp",
  "direction": "IN",
  "message": {
    "id": "wamid.HBg...",
    "from": "5511999999999",
    "to": "551151183815",
    "contents": [
      {
        "type": "flow_response",
        "token": "{{ lead_id }}",
        "body": "Simulação de crédito",
        "data": {
          "valor_simulacao": 50000,
          "faturamento_medio": "100000",
          "consentimento": true
        }
      }
    ]
  }
}
```

---

## 5. Implementação no Backend (Assim que tivermos o `FLOW_ID`)

Assim que a Zenvia nos entregar o `FLOW_ID`, executaremos as seguintes adaptações:

### 1. `porteiro/src/index.ts`
* O porteiro intercepta o tipo `content.type === 'flow_response'` e repassa o payload estruturado para a tabela de mensagens e para o n8n com a tag `is_flow_response: true`.

### 2. `docs/ROTEADOR_DE_CONTEXTO_COMPLETO.js` (N8N)
* Ao detectar `flow_response`:
  * Converte `valor_simulacao` para número (`50000`);
  * Converte `faturamento_medio` para número (`100000`);
  * Registra `consentimento = true`;
  * Define `leadInfo.requested_amount = 50000`;
  * Define `leadInfo.revenue = 100000`;
  * Define `leadInfo.opt_in = true`;
  * Grava os metadados de auditoria:
    * `consent_timestamp = new Date().toISOString()`
    * `consent_version = "v1-2026-06"`
    * `consent_channel = "whatsapp_flow"`
    * `flow_token = token`
  * Transiciona imediatamente para o passo `criar_lead` / `solicitar_simulacao`, e a Sofia responde:
    > *"Perfeito! Recebi suas informações. ⏳ Já enviei sua solicitação para análise da Fiserv (~1 minuto). Assim que tivermos o retorno, te chamo aqui com o resultado!"*

### 3. Fallback de Segurança Garantido
* Se por algum motivo o dispositivo do cliente for antigo e não suportar WhatsApp Flows, ou se o cliente preferir mandar uma mensagem de texto com dúvidas, **o fluxo conversacional tradicional da Sofia de 2 perguntas entra automaticamente em ação como fallback**, garantindo **zero perda de leads**.

---

## 6. Checklist de Ativação

- [x] Criação do arquivo Flow JSON v6.0 ([`flows/simulacao_credito.json`](file:///Users/user/SaaS%20-%20Davos%20Nexus/agent-nexus-hub/flows/simulacao_credito.json))
- [x] Validação sintática do schema e da navegação multitelas
- [x] Documentação das rotas e payloads da Zenvia API v2
- [ ] Solicitação enviada à equipe da Zenvia com o JSON
- [ ] Recebimento do `FLOW_ID` da Meta/Zenvia
- [ ] Atualização da variável de ambiente `FLOW_ID_SIMULACAO`
- [ ] Ativação do envio do Flow no Porteiro / N8N
- [ ] Teste em número de homologação e liberação para a campanha ativa
