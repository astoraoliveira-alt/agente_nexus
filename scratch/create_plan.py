import sys
import json
import uuid

with open('/Users/user/SaaS - Davos Nexus/agent-nexus-hub/scratch/roteador_final.js', 'r') as f:
    js_code = f.read()

plan_content = f"""# Implementar Simulação de Crédito Fiserv no n8n

Este plano descreve as etapas técnicas completas necessárias para adicionar a funcionalidade de simulação da Fiserv (`POST /simulation`) no seu fluxo de atendimento pelo WhatsApp. 

O código abaixo do **Roteador de Contexto** está integral, contendo todas as mais de 730 linhas originais mais as modificações feitas para a simulação (extração do campo `requested_installments` e controle de transição de estado para `solicitar_simulacao`).

## 1. Atualizar o Nó Roteador (Javascript)

Copie o código completo abaixo e cole integralmente no seu nó **Roteador de Contexto** no n8n.

```javascript
{js_code}
```

## 2. Ajustes Visuais no Fluxo do n8n

Edite o seu fluxo `Agente Nexus - Whatts Fila (FISERV_TICKET) TESTE (4)` para rotear a simulação e chamar a API Fiserv.

### A) Atualizar o Nó `Roteia Criacao Lead` (Switch)
No nó *Switch* existente chamado **Roteia Criacao Lead**, adicione uma nova rota de saída:
- **Routing Rules** -> **Add Rule**
- **Value 1:** `{{{{ $json.currentStep }}}}`
- **Condition:** `Equal`
- **Value 2:** `solicitar_simulacao`

Isso fará com que o nó crie uma nova bolinha de saída (output).

### B) Adicionar Nó `HTTP Request` para Simular Empréstimo
Conecte a nova saída do Switch recém-criada a um novo nó **HTTP Request**. Configure este nó da seguinte forma:
- **Method:** `POST`
- **URL:** `https://apidev.moneymoneyinvest.com.br/business-partners/clover-capital/loan-requests/{{{{ $('Roteador de Contexto').first().json.lead_info.loan_request_id }}}}/simulation`
- **Authentication:** Use as credenciais da Fiserv (Bearer Token) como feito no fluxo de Criação de Lead.
- **Send Headers:** Habilite e adicione o header `Content-Type: application/json`
- **Send Body:** Habilite
- **Body Parameters:** Use "Specify Body" (Formato JSON) e defina:
```json
{{
  "requested_amount": "{{{{ $('Roteador de Contexto').first().json.requested_amount }}}}",
  "requested_installments": "{{{{ $('Roteador de Contexto').first().json.requested_installments }}}}"
}}
```

### C) Adicionar Nó `Set` para Formatar Resposta
Conecte a saída de Sucesso do nó *HTTP Request* a um novo nó **Set** (ou Edit Fields). Configure-o para montar a resposta da IA que irá para o WhatsApp:
- Crie um novo campo String chamado `output` (ou o nome da variável de mensagem que você usa no seu fluxo) e coloque a expressão:
```text
Simulação concluída! ✅

Para o valor de *R$ {{{{ $('Roteador de Contexto').first().json.requested_amount }}}}* em *{{{{ $('Roteador de Contexto').first().json.requested_installments }}}}x*, o valor da sua parcela será de *R$ {{{{ $json.simulation_data.VlrParcela }}}}*. A taxa de juros aplicada para o seu perfil foi de *{{{{ $json.simulation_data.PercJurosMensal }}}}% a.m*.

Podemos seguir com a formalização deste valor e prazo?
```

### D) Retornar o Fluxo
Ligue a saída do nó *Set* diretamente ao nó ou linha de execução que envia a mensagem para a fila/WhatsApp do cliente.

> [!IMPORTANT]
> Avalie este plano completo e o código do roteador. Se você estiver de acordo com as alterações, siga as instruções de cópia de código acima para sua interface do n8n.
"""

with open('/Users/user/.gemini/antigravity-ide/brain/6b0beae4-0e95-4598-8e40-34cdf58a7b9a/implementation_plan.md', 'w') as f:
    f.write(plan_content)

# Update metadata json to mark as requiring feedback
try:
    with open('/Users/user/.gemini/antigravity-ide/brain/6b0beae4-0e95-4598-8e40-34cdf58a7b9a/.artifacts.json', 'r') as f:
        meta = json.load(f)
    for art in meta.get('artifacts', []):
        if art.get('id') == 'implementation_plan.md':
            art['metadata']['request_feedback'] = True
    with open('/Users/user/.gemini/antigravity-ide/brain/6b0beae4-0e95-4598-8e40-34cdf58a7b9a/.artifacts.json', 'w') as f:
        json.dump(meta, f)
except Exception as e:
    pass

print("Plan written successfully.")
