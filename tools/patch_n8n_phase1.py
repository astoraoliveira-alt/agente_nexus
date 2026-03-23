import json
import os

FILE_PATH = "/Users/user/SaaS - Davos Nexus/agent-nexus-hub/database/json n8n/Agente Nexus - Whatts Fila.json"

with open(FILE_PATH, 'r') as f:
    data = json.load(f)

for node in data.get('nodes', []):
    if node['name'] == 'Origem Requisicao':
        for param in node.get('parameters', {}).get('values', {}).get('string', []):
            if param['name'] == 'url':
                param['value'] = '={{ $env["N8N_ENV_SUPABASE_URL_AGENT"] }}'
            elif param['name'] == 'apikey':
                param['value'] = '={{ $env["N8N_ENV_SUPABASE_KEY_AGENT"] }}'
                
    if node['name'] == 'Code in JavaScript2' or node['name'] == 'Code (Generates LLM Event)':
        node['name'] = 'Code (Generates LLM Event)'
        node['parameters']['jsCode'] = """// Padrão único de evento de uso (LLM Usage Contract)

// Se trace_id não existe ainda para o legacy flow, usa um default ou gera. FASE 2 vai refinar isso na raiz.
const traceId = $('Edit Fields').first().json?.trace_id || $('RPC - Acesso Entrada').first().json?.context?.conversation?.id || $generateUuid();

return [{
   json: {
     event_type: "llm_usage",
     trace_id: traceId,
     idempotency_key: traceId + "_llm_usage",
     timestamp: new Date().toISOString(),
     tenant_id: $('Edit Fields').first().json.tenant_id,
     agent_id: $('Edit Fields').first().json.agent_id,
     model: $json.model || $('Edit Fields').first().json?.agent?.modelId || 'gpt-4o-mini',
     usage: {
        prompt_tokens: $json.prompt_tokens || $json.llm_prompt_tokens || 0,
        completion_tokens: $json.completion_tokens || 0,
        total_tokens: $json.total_tokens || 0
     },
     metadata: {
        channel: "whatsapp",
        provider: "evolution",
        conversation_id: $('Edit Fields').first().json["conversation.id"]
     }
   }
}];
"""

    if node['name'] == 'HTTP Request1' or node['name'] == 'RPC (Log LLM Usage)':
        node['name'] = 'RPC (Log LLM Usage)'
        node['parameters']['url'] = "={{ $('Origem Requisicao').first().json.url }}/rest/v1/rpc/fn_track_llm_usage"
        node['parameters']['jsonBody'] = "={\n  \"p_event\": {{ JSON.stringify($json) }}\n}"

with open(FILE_PATH, 'w') as f:
    json.dump(data, f, indent=2)

print("N8N workflow repatched successfully with _AGENT suffix.")
