import fs from 'fs';

// Mock n8n environment variables/functions
const $json = {
    content: "Quero fazer uma simulação"
};

const $node = {
    "RPC - Acesso Entrada": {
        json: {
            context: {
                status: 'active',
                lead_info: {
                    cnpj: "98589096000501",
                    name: "DAVOS AD CONSULTORIA E ASSESSORIA EMPRESARIAL LTDA",
                    is_lead: true
                },
                agent: {
                    workflow_blueprint: {
                        steps: {
                            start: { rules: "Start rules" },
                            explicacao_agente: { rules: "Explicacao rules" },
                            verificacao_cnpj: { rules: "Verificacao rules" }
                        }
                    }
                },
                messages_history: [
                    { sender_type: 'Cliente', content: "oi" },
                    {
                        sender_type: 'assistant',
                        content: "Já pensou em reforçar o caixa sem burocracia?\n\nVocê pode ter até *R$ 500 mil* disponíveis, usando apenas seus recebíveis Ticket como garantia. A consulta é rápida e sem compromisso.\n\n✅ Taxas a partir de *1,89% a.m*;\n✅ Crédito disponível entre *10 mil a 500 mil reais*;\n✅ Recebimento do dinheiro em até *24h*;\n\n👉 Posso enviar o link para simular o valor disponível para o seu CNPJ ou ficou com alguma dúvida?"
                    }
                ]
            },
            p_conversation_id: "4d823716-5b5d-449d-91c6-7b159596eb23"
        }
    }
};

const $ = (nodeName) => {
    return {
        first: () => ({
            json: {
                output: [
                    {
                        content: [
                            {
                                text: JSON.stringify({ intent: "OTHER", reasoning: "" })
                            }
                        ]
                    }
                ]
            }
        })
    };
};

// Read the js file content
let jsCode = fs.readFileSync('n8n/roteador_contexto_v13_deterministic.js', 'utf8');

// Wrap it in a function we can call and execute
const execute = new Function('fs', '$json', '$node', '$', jsCode);

try {
    const result = execute(fs, $json, $node, $);
    console.log("EXECUTION RESULT:", JSON.stringify(result, null, 2));
} catch (err) {
    console.error("EXECUTION ERROR:", err);
}
