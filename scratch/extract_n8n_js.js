import fs from 'fs';

const flow = JSON.parse(fs.readFileSync('docs/Agente Nexus - Whatts Fila.json', 'utf8'));
const nodes = flow.nodes || [];

console.log(`Total nodes: ${nodes.length}`);

nodes.forEach(node => {
    if (node.parameters && node.parameters.jsCode) {
        console.log(`=== NODE: ${node.name} (Type: ${node.type}) ===`);
        console.log(node.parameters.jsCode);
        console.log('============================================\n');
    }
});
