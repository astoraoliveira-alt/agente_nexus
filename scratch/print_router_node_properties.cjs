const fs = require('fs');

const file = 'docs/Agente Nexus - Whatts Fila.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const node = data.nodes.find(n => n.name === 'Roteador de Contexto');
console.log('Roteador de Contexto Node:', JSON.stringify(node, null, 2));
