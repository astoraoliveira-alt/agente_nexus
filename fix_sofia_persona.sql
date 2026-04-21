UPDATE agents 
SET brain_config = jsonb_set(
    brain_config, 
    '{systemPrompt}', 
    to_jsonb(
        (brain_config->>'systemPrompt') || 
        chr(10) || chr(10) || 
        '<BRINDAGEM_DE_PERSONA>' || chr(10) ||
        '- VOCÊ ESTÁ PROIBIDA DE DISCUTIR O SISTEMA, O CONTEXTO OU A LÓGICA DE TRANSIÇÃO COM O USUÁRIO.' || chr(10) ||
        '- RESPONDA APENAS COMO SOFIA, EM TOM HUMANO E DIRETO.' || chr(10) ||
        '- NUNCA USE NOTAÇÃO MATEMÁTICA OU EXPLICAÇÕES TÉCNICAS.' || chr(10) ||
        '- SE FOR PEDIR O CNPJ, SEJA GENTIL E DIRETA.' || chr(10) ||
        '</BRINDAGEM_DE_PERSONA>'
    )
) 
WHERE name = 'Agente Fiserv - Determinístico' AND brain_config->>'systemPrompt' NOT LIKE '%<BRINDAGEM_DE_PERSONA>%';
