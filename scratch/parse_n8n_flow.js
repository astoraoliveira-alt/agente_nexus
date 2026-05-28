import fs from 'fs';

const file = 'docs/Agente Nexus - Whatts Fila.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

// Find Roteador de Contexto
const routerNode = data.nodes.find(n => n.name === 'Roteador de Contexto');
console.log('Router Node:', routerNode?.id, routerNode?.name);

// Find connections
const connections = data.connections;
console.log('Downstream connections from Roteador de Contexto:');
const downstream = [];
for (const [sourceNodeName, sourceConns] of Object.entries(connections)) {
    if (sourceNodeName === 'Roteador de Contexto') {
        console.log(JSON.stringify(sourceConns, null, 2));
    }
}

// Print all node names and types
console.log('\n--- ALL NODES ---');
data.nodes.forEach(n => {
    console.log(`[${n.type}] Name: ${n.name}`);
});
