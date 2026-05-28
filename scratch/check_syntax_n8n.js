import fs from 'fs';
import vm from 'vm';

try {
    const code = fs.readFileSync('n8n/roteador_contexto_v13_deterministic.js', 'utf8');
    // Wrap the code in a function to allow return statements
    const wrappedCode = `async function test() {
        const $node = { "RPC - Acesso Entrada": { json: { context: {}, conversation: {}, p_conversation_id: "123" } } };
        const $json = { content: "oi" };
        ${code}
    }`;
    new vm.Script(wrappedCode);
    console.log("✅ Syntax check passed!");
} catch (e) {
    console.error("❌ Syntax check failed:", e);
    process.exit(1);
}
