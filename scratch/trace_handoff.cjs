const fs = require('fs');

const file = 'docs/Agente Nexus - Whatts Fila.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

console.log('Downstream connections from "If handoff":');
for (const [sourceNodeName, sourceConns] of Object.entries(data.connections)) {
    if (sourceNodeName === 'If handoff') {
        console.log(JSON.stringify(sourceConns, null, 2));
    }
}
