import json

def run():
    with open('/Users/user/SaaS - Davos Nexus/agent-nexus-hub/database/json n8n/Agente Nexus - Whatts Fila (FISERV_TICKET) TESTE (4).json', 'r') as f:
        data = json.load(f)
    for n in data.get('nodes', []):
        if n.get('name') == 'Roteia Criacao Lead':
            print(json.dumps(n, indent=2))
            break
            
if __name__ == '__main__':
    run()
