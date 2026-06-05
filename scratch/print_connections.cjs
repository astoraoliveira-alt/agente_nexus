const fs = require('fs');

const file = 'docs/Agente Nexus - Whatts Fila.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

console.log('Keys in connections matching "Salvar":');
Object.keys(data.connections).forEach(k => {
  if (k.includes('Salvar') || k.includes('handoff') || k.includes('Handoff') || k.includes('Contato')) {
    console.log(k);
  }
});
