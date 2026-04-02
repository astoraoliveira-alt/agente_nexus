# Plano de Arquitetura: Conversational Decision Engine (State & Intent)

Este documento eleva o design do fluxo conversacional para uma **Arquitetura de Inteligência Conversacional Estruturada e Multi-Tenant**, alinhada com o banco de dados do Davos Nexus (`flows`, `flow_stages`, `policies`). A solução resolve o caso Edenred sem criar acoplamento, transformando a inteligência em uma *capacidade nativa da plataforma*.

---

## 1. Estrutura de Estado Nativa (State Management)

Não precisamos inventar uma nova topologia do zero. O Nexus já possui as amarras lógicas corretas na tabela `conversations`. Ampliaremos o uso do JSONB para comportar os delimitadores de *Journey*.

```json
/* Persistido em public.conversations */
{
  "id": "uuid",
  "current_flow_id": "uuid_do_fluxo_edenred", 
  "current_stage_id": "uuid_da_etapa_atual", // FK -> flow_stages (ex: abertura, qualificacao, conversao)
  "context_state": { // Nova coluna JSONB ou expansão
    "last_intent": "duvida",
    "flags": {
      "link_sent": false,
      "cnpj_requested": false
    }
  }
}
```

---

## 2. O Motor de Classificação e Decisão (Agnóstico a Tenant)

O motor do N8N **não deve conter regras hardcoded** (ex: `if (intent === 'pronto_link')`). Toda a configuração de regras mora no banco do Nexus (via UI) e o N8N apenas atua como um *executor de políticas (Policy Enforcer)*.

### 2.1. Inbound & Context Hydration
O N8N recebe o Webhook da Evolution e busca no Supabase:
- O contato (e seus `metadata` puros, como link customizado e CNPJ).
- A conversa e o `stage` atual.
- O Agente (com seu `brain_config` e as `policies` aplicadas).

### 2.2. Dynamic Intent Classifier (LLM Leve)
O N8N aciona o LLM classificador injetando **os intents permitidos pela política daquele Agente/Stage**. 
- O Nexus UI fornecerá as categorias: `[duvida, taxa, pronto_link, reclamacao]`. 
- O N8N obriga o LLM a cuspir estritamente uma dessas chaves. A lista nunca é fixa em código.

### 2.3. Universal Decision Engine (O Gatekeeper de Fluxo)
Aqui o N8N cruza o Estado da Conversa com as Políticas do Nexus (`AIPolicy` de `canDo` e `cannotDo`).

```javascript
/* Node: JS Decision Engine (Agnóstico) */
const intent = $input.item.json.intent;
const state = $input.item.json.context_state || {};
const stage = $input.item.json.current_stage; // Dados vindos da tabela flow_stages
const policy = $input.item.json.policies; // Regras extraídas da tabela policies

let decision = {
  allowed_actions: [...policy.canDo],
  blocked_actions: [...policy.cannotDo],
  fixed_response: null,
  force_stage_transition: null
};

// Avaliação Genérica: A política impede o envio da ferramenta/link se a intenção for 'duvida'?
if (policy.cannotDo.includes(`send_link_on_${intent}`)) {
  decision.blocked_actions.push("send_link");
}

// Avaliação de State/Flags genérica (exceções de repetição)
policy.one_time_actions.forEach(action => {
  if (state.flags[`${action}_executed`]) {
    decision.blocked_actions.push(action);
  }
});

return decision;
```

### 2.4. Main Worker (LLM de Diálogo Seguro)
O N8N aciona o modelo de inferência pesada (GPT-4o), passando no System Prompt:
- A Persona (do Agente Nexus).
- `[BLOCKED_ACTIONS: ...decision.blocked_actions]` (Ex: Se "send_link" estiver bloqueado, a ferramenta é ocultada da API de Tools do OpenAI para impedir alucinações de CTAs precoces).

---

## 3. Benefícios do Padrão Multi-Tenant

1. **Zero Hardcode Edenred:** Se amanhã entrar o "Banco Davos", você apenas cria um Fluxo na Tabela `flows`, define os `flow_stages`, e cadastra as `policies` de permissão. O N8N orquestra usando a mesma lógica.
2. **Separação de Regras X Forma:** 
   - O que o Bot "não pode fazer" → Política de Tabela (`cannotDo`). 
   - A resposta "fofinha ou formal" → `brain_config`.
3. **Escalável pra Funcionalidades Futuras:** Como os `Intents` são persistidos atrelados aos `flow_stages`, teremos analytics impecáveis! Podemos saber exatamente que a Edenred perde *40% dos clientes no `stage` Qualificação por conta do `intent` "Taxa_Alta".*

---

## 4. O Ghosting / Cron Seguro
Com a conversa tendo ID do fluxo e do estágio, as campanhas abandonadas ficam categorizadas de forma nativa. Um Worker do N8N buscando conversas *idle* fará isso baseada em metadados:
- Se Inativo por 10min em `flow = Edenred` e `stage = Qualificação` -> Geração de mensagem baseada no stage de Qualificação.
