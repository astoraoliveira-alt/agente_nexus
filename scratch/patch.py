import sys

def patch():
    with open('/Users/user/SaaS - Davos Nexus/agent-nexus-hub/scratch/patched_roteador_no_link.js', 'r') as f:
        code = f.read()

    # 1. Add requested_installments extraction
    find_str = """    // Mantido para compatibilidade (revenue/requested_amount não são coletados ativamente mas podem existir no contexto)
    let revenue = findValueForQuestion(history, ["faturamento médio mensal", "faturamento medio mensal"]);
    let requested_amount = findValueForQuestion(history, ["valor de empréstimo", "valor de emprestimo", "deseja simular"]);"""
    
    replace_str = """    // Mantido para compatibilidade (revenue/requested_amount não são coletados ativamente mas podem existir no contexto)
    let revenue = findValueForQuestion(history, ["faturamento médio mensal", "faturamento medio mensal"]);
    let requested_amount = findValueForQuestion(history, ["valor de empréstimo", "valor de emprestimo", "deseja simular"]) || parseNumber(lastUserLower.replace(/ parcelas?/g, ""));
    let requested_installments = findValueForQuestion(history, ["quantidade de parcelas", "em quantas parcelas", "prazo de pagamento"]) || parseNumber(lastUserLower.replace(/ parcelas?/g, ""));
    // Evita conflito: se pediu "10 parcelas", 10 é installment, não amount. Se amount for muito baixo, anula.
    if (requested_amount && requested_amount < 100) requested_amount = leadInfo.requested_amount;"""
    
    code = code.replace(find_str, replace_str)

    # 2. Update apresenta_ofertas logic
    find_str2 = """    } else if (currentStep === 'apresenta_ofertas') {
        if (!isDoubt) {
            nextStep = 'confirmacao_cliente';
            transitionApplied = true;
        }"""

    replace_str2 = """    } else if (currentStep === 'apresenta_ofertas') {
        if (requested_installments && !isDoubt) {
            nextStep = 'solicitar_simulacao';
            transitionApplied = true;
        } else if (!isDoubt) {
            nextStep = 'confirmacao_cliente';
            transitionApplied = true;
        }"""
        
    code = code.replace(find_str2, replace_str2)

    # 3. Add to output
    find_str3 = """        lead_info: {
            cnpj: leadInfo.cnpj,
            phone: rpcData.payload?.phone || leadInfo.phone || ctx.payload?.phone,
            name: leadInfo.name,
            revenue: revenue || leadInfo.revenue,
            requested_amount: requested_amount || leadInfo.requested_amount
        },
        revenue: revenue,
        requested_amount: requested_amount,"""
        
    replace_str3 = """        lead_info: {
            cnpj: leadInfo.cnpj,
            phone: rpcData.payload?.phone || leadInfo.phone || ctx.payload?.phone,
            name: leadInfo.name,
            revenue: revenue || leadInfo.revenue,
            requested_amount: requested_amount || leadInfo.requested_amount,
            requested_installments: requested_installments || leadInfo.requested_installments
        },
        revenue: revenue,
        requested_amount: requested_amount,
        requested_installments: requested_installments,"""
        
    code = code.replace(find_str3, replace_str3)
    
    # 4. Add text response for solicitar_simulacao
    find_str4 = """    } else if (nextStep === 'criar_lead') {
        forcedText = `Perfeito, ${leadInfo.name || "parceiro"}! ✅\\n\\nVou enviar suas informações agora para a Fiserv fazer a avaliação de crédito do seu CNPJ *${leadInfo.cnpj || ""}*.\\n\\nA análise é rápida e te retorno aqui mesmo com o resultado em instantes. Aguarde um momento! 🔄`;
    }"""
    
    replace_str4 = """    } else if (nextStep === 'criar_lead') {
        forcedText = `Perfeito, ${leadInfo.name || "parceiro"}! ✅\\n\\nVou enviar suas informações agora para a Fiserv fazer a avaliação de crédito do seu CNPJ *${leadInfo.cnpj || ""}*.\\n\\nA análise é rápida e te retorno aqui mesmo com o resultado em instantes. Aguarde um momento! 🔄`;
    } else if (nextStep === 'solicitar_simulacao') {
        forcedText = `Aguarde um instante, ${leadInfo.name || "parceiro"}! Estou calculando as taxas e parcelas da sua simulação de *R$ ${requested_amount || ""}* em *${requested_installments || ""}x* diretamente com a Fiserv... 🧮`;
    }"""
    
    code = code.replace(find_str4, replace_str4)

    with open('/Users/user/SaaS - Davos Nexus/agent-nexus-hub/scratch/roteador_final.js', 'w') as f:
        f.write(code)

if __name__ == '__main__':
    patch()
