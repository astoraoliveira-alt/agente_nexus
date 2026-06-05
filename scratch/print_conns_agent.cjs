const fs = require('fs');

const file = 'docs/Agente Nexus - Whatts Fila.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

console.log('Connections for AI Agent (Conversacional/RAG)1:');
for (const [sourceNodeName, sourceConns] of Object.entries(data.connections)) {
    if (sourceNodeName.includes('Conversacional/RAG)1') || sourceNodeName.includes('RAG)1')) {
        console.log(sourceNodeName, ':', JSON.stringify(sourceConns, null, 2));
    }
}
