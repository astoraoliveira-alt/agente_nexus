const fs = require('fs');

const file = 'docs/Agente Nexus - Whatts Fila.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

console.log('Connections for Salvar Contato Tabela:');
for (const [sourceNodeName, sourceConns] of Object.entries(data.connections)) {
    if (sourceNodeName.includes('Salvar Contato Tabela') || sourceNodeName.includes('Salvar') || sourceNodeName.includes('Tabela')) {
        console.log(sourceNodeName, ':', JSON.stringify(sourceConns, null, 2));
    }
}
