import json
import sys

def analyze(filepath):
    print(f"=== Analyzing {filepath} ===")
    with open(filepath, 'r') as f:
        data = json.load(f)
    
    nodes = {n['name']: n for n in data.get('nodes', [])}
    connections = data.get('connections', {})
    
    for n_name, conn in connections.items():
        if 'Roteia' in n_name or 'If' in n_name or 'Switch' in n_name or 'Simul' in n_name:
            print(f"Connections from {n_name} ({nodes.get(n_name, {}).get('type')}):")
            for i, outs in enumerate(conn.get('main', [])):
                for out in outs:
                    print(f"  [{i}] -> {out['node']}")
        
if __name__ == "__main__":
    analyze(sys.argv[1])
