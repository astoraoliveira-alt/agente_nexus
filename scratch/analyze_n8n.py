import json
import sys

def analyze(filepath):
    print(f"=== Analyzing {filepath} ===")
    with open(filepath, 'r') as f:
        data = json.load(f)
    
    nodes = data.get('nodes', [])
    connections = data.get('connections', {})
    
    print(f"Total Nodes: {len(nodes)}")
    
    # Just list nodes that might be related to Fiserv or IF statements
    for n in nodes:
        name = n.get('name', '')
        type_ = n.get('type', '')
        if 'fiserv' in name.lower() or 'if' in name.lower() or 'switch' in name.lower() or 'simula' in name.lower() or 'roteador' in name.lower():
            print(f"- Node: {name} ({type_})")

    # Trace from Roteador
    roteador_node = next((n for n in nodes if 'Roteador' in n.get('name', '')), None)
    if roteador_node:
        print("\nFound Roteador:", roteador_node['name'])
        outputs = connections.get(roteador_node['name'], {}).get('main', [])
        for i, out_list in enumerate(outputs):
            for out in out_list:
                print(f"  -> output {i} connects to {out['node']}")
        
if __name__ == "__main__":
    analyze(sys.argv[1])
    print()
    analyze(sys.argv[2])
