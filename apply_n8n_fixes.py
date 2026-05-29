import json

file1 = "database/json n8n/Agente - Campanha - Scheduler(Msg Inicial) (1).json"
with open(file1, "r") as f:
    data1 = json.load(f)

for node in data1.get("nodes", []):
    if "handle_outbound_sent" in node.get("name", ""):
        body = node["parameters"]["jsonBody"]
        # Inserir p_idempotency_key logo antes de p_remote_id ou p_trace_id
        if "p_idempotency_key" not in body:
            new_key = '  "p_idempotency_key": "{{ $(\'Loop Over Items\').item.json.campaign_id }}_{{ $(\'Loop Over Items\').item.json.phone }}",\n'
            body = body.replace('"p_trace_id"', new_key + '  "p_trace_id"')
            node["parameters"]["jsonBody"] = body
            print("Fixed file 1 idempotency key")

with open(file1, "w") as f:
    json.dump(data1, f, indent=2)


file2 = "database/json n8n/UTIL - Send WhatsApp Message.json"
with open(file2, "r") as f:
    data2 = json.load(f)

for node in data2.get("nodes", []):
    if node.get("name") == "HTTP Request - Zenvia":
        body = node["parameters"]["jsonBody"]
        if "split('?t=')" in body:
            # Replace the old split logic with URL parsing
            old_logic = "        \"variavellink\": $json.cta_link\n          ? $json.cta_link.split('?t=')[1].split('&')[0]\n          : \"\","
            new_logic = "        \"variavellink\": $json.cta_link\n          ? (new URL($json.cta_link).searchParams.get('t') || \"\")\n          : \"\","
            body = body.replace(old_logic, new_logic)
            # In case the formatting is slightly different
            body = body.replace("$json.cta_link.split('?t=')[1].split('&')[0]", "(new URL($json.cta_link).searchParams.get('t') || \"\")")
            node["parameters"]["jsonBody"] = body
            print("Fixed file 2 URL parsing")

with open(file2, "w") as f:
    json.dump(data2, f, indent=2)

