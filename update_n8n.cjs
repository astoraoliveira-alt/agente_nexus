const fs = require('fs');

const path = 'database/json n8n/Agente - (Encerrar Conversas Ativas).json';
const flow = JSON.parse(fs.readFileSync(path, 'utf8'));

// Modifica o nó Enviar Msg para usar a variavel
const sendMsgNode = flow.nodes.find(n => n.name === 'Enviar Msg');
sendMsgNode.parameters.workflowInputs.value.message = "={{ $json.idle_closure_message }}";

// Cria Nó de Loop
const loopNode = {
  "parameters": {
    "batchSize": 10,
    "options": {}
  },
  "type": "n8n-nodes-base.splitInBatches",
  "typeVersion": 3,
  "position": [250, 0],
  "id": "loop-node-1234",
  "name": "Loop (Prevenir Rate Limit)"
};

// Cria Nó Wait
const waitNode = {
  "parameters": {
    "amount": 2,
    "unit": "seconds"
  },
  "type": "n8n-nodes-base.wait",
  "typeVersion": 1.1,
  "position": [450, 0],
  "id": "wait-node-1234",
  "name": "Pausa 2s"
};

// Modifica nó IF (atual) para checar o toggle
const ifNode = flow.nodes.find(n => n.name === 'If');
ifNode.name = "Verifica se deve enviar msg";
ifNode.parameters.conditions.conditions[0] = {
  "id": "check-send-msg",
  "leftValue": "={{ $json.send_idle_closure_message }}",
  "rightValue": true,
  "operator": {
    "type": "boolean",
    "operation": "true",
    "singleValue": true
  }
};
ifNode.position = [650, 0];
sendMsgNode.position = [850, -100];

// Refazer Conexões
flow.connections = {
  "Schedule Trigger": {
    "main": [ [ {"node": "Origem Requisicao", "type": "main", "index": 0} ] ]
  },
  "Origem Requisicao": {
    "main": [ [ {"node": "HTTP Request", "type": "main", "index": 0} ] ]
  },
  "HTTP Request": {
    "main": [ [ {"node": "Loop (Prevenir Rate Limit)", "type": "main", "index": 0} ] ]
  },
  "Loop (Prevenir Rate Limit)": {
    "main": [
      [ {"node": "Pausa 2s", "type": "main", "index": 0} ], // Done branch -> not connected or connected to end
      [] // Wait, n8n loop: index 0 is loop branch, index 1 is done branch
    ]
  },
  "Pausa 2s": {
    "main": [ [ {"node": "Verifica se deve enviar msg", "type": "main", "index": 0} ] ]
  },
  "Verifica se deve enviar msg": {
    "main": [
      [ {"node": "Enviar Msg", "type": "main", "index": 0} ], // True
      [ {"node": "Loop (Prevenir Rate Limit)", "type": "main", "index": 0} ]  // False -> loop again
    ]
  },
  "Enviar Msg": {
    "main": [ [ {"node": "Loop (Prevenir Rate Limit)", "type": "main", "index": 0} ] ] // After sending, loop again
  }
};

// Remove nodes that are old if they are orphaned (we kept them all and just added 2)
flow.nodes.push(loopNode, waitNode);

fs.writeFileSync(path, JSON.stringify(flow, null, 2));
console.log('n8n flow updated');
