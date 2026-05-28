const str = `<output>Perfeito! É só clicar no link abaixo, preencher os campos 'nome', 'telefone' e 'faturamento mensal', depois clique em 'solicitar análise' para finalizar.

O retorno da análise será feito diretamente pela equipe Fiserv via WhatsApp em até 24h.

https://fiservcapital.moneymoneyinvest.com.br/ticket/solicite-agora?t=123

Haverá obrigatoriedade de manutenção do domicílio bancário no banco indicado durante a vigência do contrato.

Precisando estou por aqui!</output>`;

let cleanMsg = str.replace(/<[^>]*>?/gm, '').trim();
console.log(cleanMsg);
