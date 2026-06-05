const fs = require('fs');

// Read the code from n8n/roteador_contexto_v13_deterministic.js
const originalCode = fs.readFileSync('n8n/roteador_contexto_v13_deterministic.js', 'utf8');

// We mock the n8n environment
function runCode(rpcData, jsonInput, semanticData) {
    const $node = {
        "RPC - Acesso Entrada": {
            json: rpcData
        }
    };
    const $json = jsonInput;
    
    // Mock the $('Message a model1').first()?.json?.output?.[0]?.content?.[0]?.text
    const $ = (nodeName) => {
        return {
            first: () => ({
                json: {
                    output: [
                        {
                            content: [
                                {
                                    text: semanticData
                                }
                            ]
                        }
                    ]
                }
            })
        };
    };

    // Run using Function constructor
    // The code uses: $node, $json, $
    const fn = new Function('$node', '$json', '$', originalCode);
    return fn($node, $json, $);
}

// Now let's define our test cases
const baseRpcData = {
    conversation: { id: "12345" },
    p_conversation_id: "12345",
    context: {
        status: "bot_active",
        lead_info: {
            is_lead: true,
            name: "Empresa Teste",
            cnpj: "12.345.678/0001-90",
            link: "https://fiserv.ticket.com.br/simulacao-sofia"
        },
        agent: {
            workflow_blueprint: {
                steps: {
                    "start": { rules: "Welcome to campaign start! {{lead_info.name}}" },
                    "explicacao_agente": { rules: "This is agent explanation step." }
                }
            }
        },
        messages_history: []
    }
};

console.log("--- Executing tests on Context Router ---");

// Test 1: Button click "Falar com um agente!"
try {
    const rpc = JSON.parse(JSON.stringify(baseRpcData));
    const json = { content: "Falar com um agente!" };
    const res = runCode(rpc, json, null);
    console.log("Test 1 (Button Click) passed!");
    console.log("Next step:", res.currentStep);
    console.log("Mode:", res.mode);
    console.log("Trigger handoff:", res.trigger_handoff);
} catch (e) {
    console.error("Test 1 failed:", e);
}

// Test 2: First complaint ("Não recebi meu reembolso")
try {
    const rpc = JSON.parse(JSON.stringify(baseRpcData));
    const json = { content: "Não recebi meu reembolso" };
    const res = runCode(rpc, json, "COMPLAINT");
    console.log("\nTest 2 (First Complaint) passed!");
    console.log("Mode (should be consultive):", res.mode);
    console.log("Trigger handoff (should be false):", res.trigger_handoff);
} catch (e) {
    console.error("Test 2 failed:", e);
}

// Test 3: Second complaint (already has a complaint in history)
try {
    const rpc = JSON.parse(JSON.stringify(baseRpcData));
    rpc.context.messages_history = [
        { sender_type: 'client', content: "Não funciona isso aqui" },
        { sender_type: 'assistant', content: "Entendo a frustração..." }
    ];
    const json = { content: "Continua com problema" };
    const res = runCode(rpc, json, "COMPLAINT");
    console.log("\nTest 3 (Second Complaint) passed!");
    console.log("Mode (should be parrot):", res.mode);
    console.log("Trigger handoff (should be true):", res.trigger_handoff);
    console.log("Handoff priority (should be high):", res.handoff_data.priority);
} catch (e) {
    console.error("Test 3 failed:", e);
}

// Test 4: Explicit human request during first complaint
try {
    const rpc = JSON.parse(JSON.stringify(baseRpcData));
    const json = { content: "Não funciona, passe para um atendente" };
    const res = runCode(rpc, json, "HUMAN_HANDOFF");
    console.log("\nTest 4 (Explicit Human Request + Complaint) passed!");
    console.log("Mode (should be parrot):", res.mode);
    console.log("Trigger handoff (should be true):", res.trigger_handoff);
} catch (e) {
    console.error("Test 4 failed:", e);
}

// Test 5: Global catch fallback on TypeError (e.g. context is missing)
try {
    const rpc = {}; // causes typeerror in main flow
    const json = {};
    const res = runCode(rpc, json, null);
    console.log("\nTest 5 (Global Catch fallback with missing context) passed!");
    console.log("Mode (should be parrot):", res.mode);
    console.log("Returned prompt:", res.final_system_prompt);
    console.log("Fallback prompt contains hardcoded welcome:", res.final_system_prompt.includes("Olá! Sou a Sofia"));
} catch (e) {
    console.error("Test 5 failed:", e);
}

// Test 6: TypeError with valid context (should fallback to campaign welcome message)
try {
    const rpc = JSON.parse(JSON.stringify(baseRpcData));
    rpc.context.messages_history = null; // triggers TypeError: Cannot read properties of null (reading 'filter')
    const json = {};
    const res = runCode(rpc, json, null);
    console.log("\nTest 6 (Global Catch with valid blueprint) passed!");
    console.log("Mode (should be parrot):", res.mode);
    console.log("Returned prompt:", res.final_system_prompt);
    console.log("Fallback prompt contains campaign start:", res.final_system_prompt.includes("Welcome to campaign start"));
} catch (e) {
    console.error("Test 6 failed:", e);
}

// Test 7: Actual throwing error (blueprint.steps = null) with no history
try {
    const rpc = JSON.parse(JSON.stringify(baseRpcData));
    rpc.context.agent.workflow_blueprint = { steps: null }; // will cause TypeError: Cannot read properties of null (reading 'start')
    const json = {};
    const res = runCode(rpc, json, null);
    console.log("\nTest 7 (Global Catch with actual error and no history) passed!");
    console.log("Mode (should be parrot):", res.mode);
    console.log("Returned prompt contains hardcoded welcome:", res.final_system_prompt.includes("Olá! Sou a Sofia"));
} catch (e) {
    console.error("Test 7 failed:", e);
}

// Test 8: Actual throwing error (blueprint.steps = null) with history (should repeat last Sofia message)
try {
    const rpc = JSON.parse(JSON.stringify(baseRpcData));
    rpc.context.agent.workflow_blueprint = { steps: null }; // will cause TypeError: Cannot read properties of null (reading 'start')
    rpc.context.messages_history = [
        { sender_type: 'assistant', content: "Minha mensagem anterior da Sofia" }
    ];
    const json = {};
    const res = runCode(rpc, json, null);
    console.log("\nTest 8 (Global Catch with actual error and history) passed!");
    console.log("Mode (should be parrot):", res.mode);
    console.log("Returned prompt contains last Sofia message:", res.final_system_prompt.includes("Minha mensagem anterior da Sofia"));
} catch (e) {
    console.error("Test 8 failed:", e);
}

