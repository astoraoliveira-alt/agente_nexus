import fs from 'fs';

const filePath = 'sofia_full_config.json';
const config = JSON.parse(fs.readFileSync(filePath, 'utf8'));

config.workflow_blueprint = {
  "steps": {
    "start": {
      "rules": "Envie EXATAMENTE este texto de introdução:\n\n'Já pensou em reforçar o caixa *sem burocracia*?\n \nVocê pode ter *até R$500 mil* disponíveis, usando apenas seus recebíveis Ticket como garantia. A consulta é *rápida e sem compromisso*.\n\n✅ Taxas a partir de *1,89% a.m*;\n✅ Crédito disponível entre *10 mil a 500 mil reais*;\n✅ Recebimento do dinheiro *em até 24h*;\n\n👉 Posso enviar o link para simular o valor disponível para o seu CNPJ ou ficou com alguma dúvida?'",
      "allowed_next": [
        "verificacao_cnpj"
      ]
    },
    "envio_link": {
      "rules": "Envie EXATAMENTE este texto (substituindo apenas a variável do link):\n\nPerfeito! É só clicar no link abaixo, preencher os campos 'nome', 'telefone' e 'faturamento mensal', depois clique em 'solicitar análise' para finalizar.\n\nO retorno da análise será feito diretamente pela equipe Fiserv via WhatsApp em até 24h.\n\n{{lead_info.link}}\n\nHaverá obrigatoriedade de manutenção do domicílio bancário no banco indicado durante a vigência do contrato.\n\nPrecisando estou por aqui!",
      "allowed_next": []
    },
    "verificacao_cnpj": {
      "rules": "Envie EXATAMENTE este texto (substituindo as variáveis):\n\nPerfeito! Antes de seguir, preciso apenas confirmar uma informação: estou falando com o responsável pelo CNPJ *{{lead_info.cnpj}}* da empresa *{{lead_info.name}}*?",
      "allowed_next": [
        "envio_link",
        "coleta_cnpj_correto"
      ]
    },
    "explicacao_agente": {
      "rules": "Envie EXATAMENTE este texto:\n\nOlá! Sou a Sofia, especialista da *Ticket*. Que bom que você quer saber mais!\n\nExplicando rapidamente: este é um reforço de caixa exclusivo para parceiros Ticket. Você pode ter de *R$ 10 mil a R$ 500 mil* com taxas a partir de *1,89% a.m.* O dinheiro cai na sua conta em até *24h* e o pagamento é feito via boleto bancário, sem comprometer seu limite de crédito.\n\n👉 Posso te enviar o link seguro para você simular o valor exato agora ou prefere tirar alguma dúvida antes? 📈",
      "allowed_next": [
        "verificacao_cnpj"
      ]
    },
    "coleta_cnpj_correto": {
      "rules": "Envie EXATAMENTE este texto:\n\nSem problema! Me passa o *CNPJ correto* para que eu possa solicitar a inclusão dele na oferta. É necessário que ele já esteja credenciado com a Ticket, ok?",
      "allowed_next": [
        "coleta_nome_estabelecimento"
      ]
    },
    "encaminhamento_correcao": {
      "rules": "Envie EXATAMENTE este texto:\n\nObrigada! Encaminhamos suas informações internamente e, tão logo possível, retomaremos o contato pelo número registrado para esse CNPJ.",
      "allowed_next": []
    },
    "coleta_nome_estabelecimento": {
      "rules": "Envie EXATAMENTE este texto:\n\nObrigada! E qual é o *nome do estabelecimento*?",
      "allowed_next": [
        "encaminhamento_correcao"
      ]
    }
  },
  "initial_step": "start"
};

fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf8');
console.log("✅ Config updated successfully!");
