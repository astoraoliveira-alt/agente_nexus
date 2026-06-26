import re

with open('scratch/patched_roteador.js', 'r') as f:
    content = f.read()

# 1. Update Start Message
old_start = "👉 Posso enviar o link para simular o valor disponível para o seu CNPJ ou ficou com alguma dúvida?"
new_start = "👉 Gostaria de fazer uma simulação sem compromisso aqui mesmo pelo WhatsApp ou ficou com alguma dúvida?"
content = content.replace(old_start, new_start)

# 2. Update Explicacao Message (2 places)
old_explicacao = "👉 Posso te enviar o link seguro para você simular o valor exato agora ou prefere tirar alguma dúvida antes? 📈"
new_explicacao = "👉 Gostaria de fazer uma simulação do valor exato aqui mesmo pelo WhatsApp agora ou prefere tirar alguma dúvida antes? 📈"
content = content.replace(old_explicacao, new_explicacao)

# 3. Remove "instrucao_de_manejo_de_dúvida" (since now we DO simulate in WhatsApp)
manejo_block = """<instrucao_de_manejo_de_dúvida>
Se o cliente insistir em simular com você (Ex: "quero fazer aqui", "você não poderia simular pra mim"):
- Explique: "*[nome do cliente], eu adoraria fazer por aqui, mas como a análise da Fiserv consulta seus recebíveis em tempo real para te dar a melhor taxa, ela precisa ser feita no ambiente seguro do site oficial. É super rápido e protege seus dados!*"
</instrucao_de_manejo_de_dúvida>"""
content = content.replace(manejo_block, "")

# 4. Update FAQ - Como funciona o empréstimo?
old_faq1 = "Para saber se você possui algum crédito disponível, é necessário que você faça a solicitação de análise de crédito pelo site da Fiserv e aguarde a devolutiva pelo WhatsApp verificado da Fiserv. Deseja simular? É sem compromisso."
new_faq1 = "Para saber se você possui algum crédito disponível, nós podemos fazer uma rápida análise de crédito aqui mesmo pelo WhatsApp, sem compromisso. Deseja simular agora?"
content = content.replace(old_faq1, new_faq1)

# 5. Update FAQ - Preciso acessar o Portal da Ticket
old_faq2 = "Não. Você não precisa acessar o Portal da Ticket para realizar a simulação. Eu te envio o link direto da Fiserv por aqui e você faz tudo no ambiente seguro deles. O Portal da Ticket é para outros assuntos, como consultar extratos ou dados."
new_faq2 = "Não. Você não precisa acessar o Portal da Ticket para realizar a simulação. Nós fazemos a simulação e análise de crédito de forma rápida e segura aqui mesmo pelo WhatsApp. O Portal da Ticket é para outros assuntos, como consultar extratos ou dados."
content = content.replace(old_faq2, new_faq2)

# 6. Update Link Request Logic
# In JavaScript, isLinkRequest is used. We shouldn't break the variable since it handles affirmative responses, but we'll leave it as is, since users might still ask "manda o link". 

# 7. Update CTA Rule 
# If the link is not sent anymore, we can change the CTA slightly.
old_cta = """<REGRA_CTA_OBRIGATORIA>
Sempre que o link de simulação já tiver sido enviado na conversa, você deve OBRIGATORIAMENTE terminar sua resposta pulando uma linha e fazendo a seguinte pergunta:
"*Você ainda tem alguma dúvida ou posso te ajudar com algo mais?*"
</REGRA_CTA_OBRIGATORIA>"""

new_cta = """<REGRA_CTA_OBRIGATORIA>
Ao final das suas explicações, se não houver um fluxo obrigatório a ser seguido, você deve OBRIGATORIAMENTE terminar sua resposta pulando uma linha e perguntando se o cliente gostaria de seguir com a simulação.
Exemplo: "*Posso seguir com a simulação do seu CNPJ ou tem mais alguma dúvida?*"
</REGRA_CTA_OBRIGATORIA>"""
content = content.replace(old_cta, new_cta)

with open('scratch/patched_roteador_no_link.js', 'w') as f:
    f.write(content)
