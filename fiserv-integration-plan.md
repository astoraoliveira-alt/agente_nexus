# Integração Conversacional Fiserv

## Goal
Substituir o envio de links externos de simulação por uma jornada conversacional em que a Sofia coleta os dados, consulta a API Fiserv em tempo real e encaminha para o operador humano após o aceite da simulação.

## Tasks
- [ ] **Etapa 1: Configurar Credenciais e Login no n8n**
  - Configurar as credenciais da API Fiserv (Sandbox/Produção) de forma segura nas variáveis de ambiente.
  - Implementar um nó de login para a API da Fiserv (`POST /business-partners/api/v2/login`) no workflow n8n.
  - *Verify:* Testar chamada de login no n8n e verificar se o token JWT é gerado e retornado corretamente.
- [ ] **Etapa 2: Implementar Sub-workflow de API Fiserv**
  - Criar um sub-workflow no n8n que encapsula chamadas para `/loan-requests`, `/{loanRequestId}/simulation` e `/{loanRequestId}/confirm_simulation`.
  - *Verify:* Enviar um payload de teste para o sub-workflow e checar se o faturamento e a simulação de parcelas ocorrem corretamente.
- [ ] **Etapa 3: Modificar Blueprint e FAQ no Agente**
  - Atualizar `sofia_full_config.json` adicionando novas etapas de coleta de faturamento e valor desejado no `workflow_blueprint`.
  - Atualizar os prompts e regras de FAQ da Sofia para adequação da jornada em chat.
  - *Verify:* Executar a consulta do agente atualizado no banco e garantir que o blueprint novo está persistido.
- [ ] **Etapa 4: Atualizar Roteador de Contexto**
  - Modificar o script do `roteador_contexto_v13_deterministic.js` para gerenciar a transição dos novos passos de simulação conversacional.
  - Chamar o sub-workflow da Fiserv dinamicamente no n8n quando a etapa atual exigir a simulação de taxas ou verificação de CNPJ.
  - *Verify:* Simular inputs do usuário na fila de teste e ver se o roteador avança corretamente as etapas e aciona as APIs.
- [ ] **Etapa 5: Fluxo de Transbordo (Handoff) e Contingência**
  - Configurar transbordo para atendente humano (`trigger_handoff = true`) somente após sucesso em `/confirm_simulation`.
  - Adicionar contingência caso a API Fiserv retorne erro, redirecionando o cliente ao humano imediatamente de forma silenciosa.
  - *Verify:* Executar testes simulando erro da API Fiserv e conferir se o transbordo para fila de suporte humano foi disparado.

## Done When
- [ ] O cliente consegue simular valores e parcelas no chat da Sofia sem links.
- [ ] A simulação é criada e confirmada no sistema da Fiserv via API.
- [ ] O transbordo humano é acionado no fim da confirmação bem-sucedida ou em caso de falha da API.
- [ ] Nenhuma mensagem de erro técnico é exposta ao cliente.

## Notes
- As credenciais de Sandbox da Fiserv devem ser obtidas com o time técnico.
- A validação do formato do CNPJ e telefone deve ser feita antes do envio para a API para evitar falhas HTTP 422.
