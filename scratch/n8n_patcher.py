import json
import uuid

file_path = "/Users/user/SaaS - Davos Nexus/agent-nexus-hub/database/json n8n/Agente Nexus - Whatts Fila (FISERV_TICKET) TESTE.json"
out_path = "/Users/user/SaaS - Davos Nexus/agent-nexus-hub/database/json n8n/Agente Nexus - Whatts Fila (FISERV_TICKET) NATIVO.json"

with open(file_path, "r") as f:
    data = json.load(f)

for node in data["nodes"]:
    if node["name"] == "Roteador de Contexto":
        js_code = node["parameters"]["jsCode"]
        
        # Replace CONVERSION_LINK logic
        old_conversion = '''case "CONVERSION_LINK":
            nextStep = (currentStep === 'cnpj_errado' || currentStep === 'cnpj_errado_followup') ? "cnpj_errado_followup" : "envio_link";
            mode = "parrot";
            break;'''
        new_conversion = '''case "CONVERSION_LINK":
            if (currentStep === 'cnpj_errado' || currentStep === 'cnpj_errado_followup') {
                nextStep = "cnpj_errado_followup";
            } else if (!leadInfo.revenue) {
                nextStep = "coleta_faturamento";
            } else if (!leadInfo.requested_amount) {
                nextStep = "coleta_valor";
            } else if (!leadInfo.opt_in) {
                nextStep = "coleta_optin";
            } else {
                nextStep = "criar_lead";
            }
            mode = "parrot";
            break;'''
        js_code = js_code.replace(old_conversion, new_conversion)
        
        # Replace envio_link text logic
        old_text = '''} else if (nextStep === "envio_link") {
                    forcedText = `Perfeito! É só clicar no link abaixo, preencher os campos 'nome', 'telefone' e 'faturamento mensal', depois clique em 'solicitar análise' para finalizar.\\n\\nO retorno da análise será feito diretamente pela equipe Fiserv via WhatsApp em até 24h.\\n\\n{{lead_info.link}}\\n\\nHaverá obrigatoriedade de manutenção do domicílio bancário no banco indicado durante a vigência do contrato.\\n\\nPrecisando estou por aqui!`;
                }'''
        new_text = '''} else if (nextStep === "envio_link") {
                    forcedText = `Perfeito! É só clicar no link abaixo, preencher os campos 'nome', 'telefone' e 'faturamento mensal', depois clique em 'solicitar análise' para finalizar.\\n\\nO retorno da análise será feito diretamente pela equipe Fiserv via WhatsApp em até 24h.\\n\\n{{lead_info.link}}\\n\\nHaverá obrigatoriedade de manutenção do domicílio bancário no banco indicado durante a vigência do contrato.\\n\\nPrecisando estou por aqui!`;
                } else if (nextStep === "coleta_faturamento") {
                    forcedText = `Perfeito! Para solicitar a sua análise, precisarei de 3 informações rápidas.\\n\\nPrimeiro, qual o *faturamento médio mensal* da sua empresa? (Apenas números aproximados)`;
                } else if (nextStep === "coleta_valor") {
                    forcedText = `Certo! E qual o *valor de crédito* que você tem interesse em simular? (Lembrando que o limite liberado pode variar entre 10 mil e 500 mil)`;
                } else if (nextStep === "coleta_optin") {
                    forcedText = `Para prosseguirmos com a sua solicitação, você aceita os termos para consulta de crédito em nome do seu CNPJ? (Responda Sim ou Não)`;
                } else if (nextStep === "criar_lead") {
                    forcedText = `Perfeito! Mandei sua solicitação para o comitê Fiserv.\\n\\n⏳ Avaliando em ~1 minuto...\\nAssim que tivermos o retorno, te chamo aqui com o resultado!`;
                }'''
        js_code = js_code.replace(old_text, new_text)
        
        node["parameters"]["jsCode"] = js_code

with open(out_path, "w") as f:
    json.dump(data, f, indent=2)

print("Flow updated and saved to NATIVO.json")
