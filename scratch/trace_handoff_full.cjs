const fs = require('fs');

const file = 'docs/Agente Nexus - Whatts Fila.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

function traceNode(nodeName, visited = new Set()) {
  if (visited.has(nodeName)) return;
  visited.add(nodeName);
  const connections = data.connections[nodeName];
  if (!connections) return;
  
  for (const [type, targets] of Object.entries(connections)) {
    for (const targetArray of targets) {
      targetArray.forEach(target => {
        console.log(`${nodeName} (${type}) -> ${target.node}`);
        traceNode(target.node, visited);
      });
    }
  }
}

console.log('--- Full Handoff Branch Trace ---');
traceNode('If handoff');
