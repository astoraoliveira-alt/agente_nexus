import json
import os

def patch_webhook_flow():
    webhook_path = 'database/json n8n/Receptor Webhook Fiserv - STATUS (1).json'
    poller_path = 'database/json n8n/Poller Fiserv Credito.json'

    print("Patching Webhook flow...")
    with open(webhook_path, 'r', encoding='utf-8') as f:
        webhook = json.load(f)
    
    with open(poller_path, 'r', encoding='utf-8') as f:
        poller = json.load(f)

    # 1. Update version of 'Atualizar status no DB' to 2.6
    for node in webhook['nodes']:
        if node['name'] == 'Atualizar status no DB':
            node['typeVersion'] = 2.6
            print("- Updated 'Atualizar status no DB' typeVersion to 2.6")

    # 2. Extract needed nodes from Poller
    target_node_names = [
        'Decidido?',
        'Inserir Outbound Queue',
        '--> handle_outbound_sent (CONECTAR)',
        'Aguardar proximo ciclo'
    ]
    
    extracted_nodes = []
    for node in poller['nodes']:
        if node['name'] in target_node_names:
            node_copy = json.loads(json.dumps(node)) # deep copy
            # Adjust positions
            if node_copy['name'] == 'Decidido?':
                node_copy['position'] = [1420, 464]
            elif node_copy['name'] == 'Inserir Outbound Queue':
                node_copy['position'] = [1640, 384]
            elif node_copy['name'] == 'Aguardar proximo ciclo':
                node_copy['position'] = [1640, 576]
            elif node_copy['name'] == '--> handle_outbound_sent (CONECTAR)':
                node_copy['position'] = [1860, 384]
            extracted_nodes.append(node_copy)

    # Add extracted nodes to webhook
    webhook['nodes'].extend(extracted_nodes)
    print(f"- Added {len(extracted_nodes)} nodes from Poller")

    # 3. Add connections
    # webhook['connections'] has:
    # "Classificar e Montar Mensagem": { "main": [ [ { "node": "Atualizar status no DB", ... } ] ] }
    # We need to add connections for:
    # - "Atualizar status no DB" -> "Decidido?"
    # - "Decidido?" -> "Inserir Outbound Queue" (index 0) and "Aguardar proximo ciclo" (index 1)
    # - "Inserir Outbound Queue" -> "--> handle_outbound_sent (CONECTAR)"
    
    webhook['connections']['Atualizar status no DB'] = {
        "main": [
            [
                {
                    "node": "Decidido?",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }
    
    webhook['connections']['Decidido?'] = {
        "main": [
            [
                {
                    "node": "Inserir Outbound Queue",
                    "type": "main",
                    "index": 0
                }
            ],
            [
                {
                    "node": "Aguardar proximo ciclo",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }

    webhook['connections']['Inserir Outbound Queue'] = {
        "main": [
            [
                {
                    "node": "--> handle_outbound_sent (CONECTAR)",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }
    print("- Configured connections for the new nodes")

    # Save patched Webhook flow
    with open(webhook_path, 'w', encoding='utf-8') as f:
        json.dump(webhook, f, indent=2, ensure_ascii=False)
    print("Webhook flow patched successfully!")


def patch_main_flow():
    main_path = 'database/json n8n/Agente Nexus - Whatts Fila (FISERV_TICKET) TESTE (2).json'
    
    print("Patching Main flow...")
    with open(main_path, 'r', encoding='utf-8') as f:
        main_flow = json.load(f)

    # Find and update Roteador de Contexto JS script
    roteador_node = next(n for n in main_flow['nodes'] if n['name'] == 'Roteador de Contexto')
    js_code = roteador_node['parameters']['jsCode']

    # Substring modifications in JS code:
    # 1. Transition from coleta_valor: nextStep = 'criar_lead'
    old_transition = """    } else if (currentStep === 'coleta_valor') {
        if (!isDoubt) {
            nextStep = 'aguardando_fiserv';
            transitionApplied = true;
        }"""
        
    new_transition = """    } else if (currentStep === 'coleta_valor') {
        if (!isDoubt) {
            nextStep = 'criar_lead';
            transitionApplied = true;
        }"""

    # Let's perform a direct replace for safety
    if old_transition in js_code:
        js_code = js_code.replace(old_transition, new_transition)
        print("- Patched coleta_valor transition in Roteador de Contexto JS")
    else:
        # Fallback to replace the single line in a more compact way if formatting is different
        js_code = js_code.replace("nextStep = 'aguardando_fiserv';\n            transitionApplied = true;\n        }\n    } else if (currentStep === 'aguardando_fiserv')", "nextStep = 'criar_lead';\n            transitionApplied = true;\n        }\n    } else if (currentStep === 'aguardando_fiserv')")
        print("- Patched coleta_valor transition via fallback replace")

    # 2. Add strings to currentStep = 'aguardando_fiserv' detection list
    old_detection = 'lastSofiaMsg.includes("enviei suas informações para a fiserv") || lastSofiaMsg.includes("análise e geração das ofertas") || lastSofiaMsg.includes("aguarde que eu já te chamo") || lastSofiaMsg.includes("gostaria de iniciar a simulação")'
    new_detection = 'lastSofiaMsg.includes("enviei suas informações para a fiserv") || lastSofiaMsg.includes("análise e geração das ofertas") || lastSofiaMsg.includes("aguarde que eu já te chamo") || lastSofiaMsg.includes("gostaria de iniciar a simulação") || lastSofiaMsg.includes("comitê fiserv") || lastSofiaMsg.includes("avaliando em ~1 minuto") || lastSofiaMsg.includes("chamarás com o resultado") || lastSofiaMsg.includes("te chamará aqui com o resultado")'
    
    if old_detection in js_code:
        js_code = js_code.replace(old_detection, new_detection)
        print("- Patched currentStep = 'aguardando_fiserv' detection in Roteador de Contexto JS")
    else:
        print("WARNING: Could not find old_detection block in JS code!")

    # 3. Map phone robustly in lead_info return
    old_phone_mapping = """        lead_info: {
            cnpj: leadInfo.cnpj,
            phone: leadInfo.phone,
            name: leadInfo.name,"""
            
    new_phone_mapping = """        lead_info: {
            cnpj: leadInfo.cnpj,
            phone: rpcData.payload?.phone || leadInfo.phone || ctx.payload?.phone,
            name: leadInfo.name,"""
            
    if old_phone_mapping in js_code:
        js_code = js_code.replace(old_phone_mapping, new_phone_mapping)
        print("- Patched phone mapping in Roteador de Contexto JS")
    else:
        print("WARNING: Could not find old_phone_mapping block in JS code!")

    # Update node parameter
    roteador_node['parameters']['jsCode'] = js_code

    # Find and update Set (Prepara Fiserv) contact_phone_number value to strip 55
    set_node = next(n for n in main_flow['nodes'] if n['name'] == 'Set (Prepara Fiserv)')
    
    phone_updated = False
    for assignment in set_node['parameters']['assignments']['assignments']:
        if assignment['name'] == 'contact_phone_number':
            assignment['value'] = "={{ ($json.lead_info.phone || $('Roteador de Contexto').first().json.lead_info?.phone || '').replace(/^55/, '') }}"
            phone_updated = True
            print("- Patched contact_phone_number in Set (Prepara Fiserv) to strip '55'")
            
    if not phone_updated:
        print("WARNING: Could not find contact_phone_number assignment in Set (Prepara Fiserv)!")

    # Save patched Main flow
    with open(main_path, 'w', encoding='utf-8') as f:
        json.dump(main_flow, f, indent=2, ensure_ascii=False)
    print("Main flow patched successfully!")


if __name__ == '__main__':
    patch_webhook_flow()
    patch_main_flow()
