const fs = require('fs');

const filePath = 'database/json n8n/Agente Nexus - Whatts Fila (14).json';
let content = fs.readFileSync(filePath, 'utf8');
const data = JSON.parse(content);

let patched = false;

function patchJsCode(node) {
    if (node.parameters && node.parameters.jsCode) {
        let code = node.parameters.jsCode;
        
        // Check if it's an output guardrail and missing XML cleaning
        if (code.includes('msg =') && !code.includes('<[^>]*>?')) {
            console.log(`Patching node: ${node.name}`);
            
            // Add the XML cleaning line
            // We'll look for where msg is finalized before return
            if (code.includes('.trim()') && code.includes('return')) {
                // Find the last msg = msg.replace(...) or similar before return
                const returnIndex = code.lastIndexOf('return');
                const lastMsgIndex = code.lastIndexOf('msg =', returnIndex);
                
                if (lastMsgIndex !== -1) {
                    // Inject before the next statement or before return
                    const nextLineIndex = code.indexOf('\n', lastMsgIndex);
                    const insertionPoint = nextLineIndex !== -1 ? nextLineIndex : lastMsgIndex;
                    
                    // Actually, let's just do it right before return
                    code = code.slice(0, returnIndex) + "msg = msg.replace(/<[^>]*>?/gm, '').trim();\n\n" + code.slice(returnIndex);
                    node.parameters.jsCode = code;
                    patched = true;
                }
            }
        }
    }
}

data.nodes.forEach(patchJsCode);

if (patched) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log('✅ n8n workflow patched successfully!');
} else {
    console.log('No nodes needed patching or could not find insertion point.');
}
