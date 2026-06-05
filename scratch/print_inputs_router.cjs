const fs = require('fs');

const file = 'docs/Agente Nexus - Whatts Fila.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

console.log('Inputs to Roteador de Contexto:');
for (const [sourceNodeName, sourceConns] of Object.entries(data.connections)) {
  for (const [type, targets] of Object.entries(sourceConns)) {
    for (const targetArray of targets) {
      targetArray.forEach(target => {
        if (target.node === 'Roteador de Contexto') {
          console.log(`${sourceNodeName} (${type}) -> Roteador de Contexto`);
        }
      });
    }
  }
}
