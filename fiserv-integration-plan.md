# Integração Conversacional Fiserv

## Goal
Substituir o envio de links externos de simulação por uma jornada conversacional em que a Sofia coleta os dados, cria a simulação via API Fiserv e aguarda o retorno assíncrono. O encaminhamento para o operador humano ocorre após o aceite ou recusa da simulação através de um Poller que notifica o cliente ativamente (outbound).

## Tasks
- [ ] **Etapa 1: Configurar Credenciais e Login no n8n**
  - Configurar as credenciais da API Fiserv (Sandbox/Produção) de forma segura nas variáveis de ambiente.
  - Implementar um nó de login para a API da Fiserv (`POST /business-partners/api/v2/login`) no workflow n8n.
  - *Verify:* Testar chamada de login no n8n e verificar se o token JWT é gerado e retornado corretamente.

- [ ] **Etapa 2: Implementar Sub-workflow de API Fiserv (Criação)**
  - Criar um sub-workflow no n8n que encapsula chamadas para `/loan-requests` e `/{loanRequestId}/simulation`.
  - Retornar o ID da simulação (`loanRequestId`) para o agente.
  - *Verify:* Enviar um payload de teste para o sub-workflow e checar se o faturamento e a simulação de parcelas ocorrem corretamente.

- [ ] **Etapa 3: Fluxo Assíncrono e Poller no n8n**
  - Ativar o workflow `Poller Fiserv Credito` que rodará periodicamente.
  - O Poller deverá ler da base os leads em andamento na Fiserv, consultar seus status e atualizar a base.
  - Após a decisão final (aprovado/recusado), o Poller deverá disparar a mensagem via `handle_outbound_sent` para retomar a conversa.
  - *Verify:* Testar o fluxo completo disparando um webhook e verificando se a mensagem proativa chega ao número do WhatsApp.

- [ ] **Etapa 4: Modificar Blueprint e FAQ no Agente**
  - Atualizar `sofia_full_config.json` adicionando novas etapas de coleta de faturamento e valor desejado no `workflow_blueprint`.
  - Atualizar os prompts e regras de FAQ da Sofia para avisar ao cliente que a análise está em andamento e pode levar alguns minutos (fluxo assíncrono).
  - *Verify:* Executar a consulta do agente atualizado no banco e garantir que o blueprint novo está persistido.

- [ ] **Etapa 5: Atualizar Roteador de Contexto**
  - Modificar o script do `roteador_contexto_v13_deterministic.js` para chamar o workflow n8n de criação de simulação.
  - Salvar o `loan_request_id` recebido da Fiserv no BD de leads.
  - *Verify:* Simular inputs do usuário na fila de teste e ver se o roteador salva o `loan_request_id` e avança o status.

- [ ] **Etapa 6: Fluxo de Transbordo (Handoff) e Contingência**
  - Configurar transbordo para atendente humano (`trigger_handoff = true`) após retorno positivo do Poller.
  - Adicionar contingência caso a API Fiserv retorne erro.
  - *Verify:* Executar testes simulando erro da API Fiserv e conferir se o transbordo para fila de suporte humano foi disparado.

## Done When
- [ ] O cliente consegue enviar dados de faturamento e simular valores no chat da Sofia sem usar links externos.
- [ ] A Sofia avisa que a proposta está em análise e, após alguns minutos, envia a resposta (via Poller outbound).
- [ ] O banco de dados salva corretamente o `loan_request_id` na coluna `metadata` do `agent_leads`.
- [ ] O transbordo humano é acionado no fim da confirmação bem-sucedida ou em caso de falha da API.
- [ ] Nenhuma mensagem de erro técnico é exposta ao cliente.

## Notes
- As credenciais de Sandbox da Fiserv devem ser obtidas com o time técnico.
- A validação do formato do CNPJ e telefone deve ser feita antes do envio para a API para evitar falhas HTTP 422.
- A mudança de arquitetura de Síncrona para Assíncrona é fundamental para o sucesso das propostas na Fiserv, considerando os SLAs de resposta.
