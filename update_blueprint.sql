-- Atualiza o workflow_blueprint do novo agente clonado com o ajuste textual (plural: "algumas informações")
UPDATE agents
SET workflow_blueprint = jsonb_set(
    workflow_blueprint,
    '{steps,verificacao_cnpj,rules}',
    '"Envie EXATAMENTE este texto (substituindo as variáveis):\n\nPerfeito! Antes de seguir, preciso apenas confirmar algumas informações: estou falando com o responsável pelo CNPJ *{{lead_info.cnpj}}* da empresa *{{lead_info.name}}*?"'::jsonb
)
WHERE name = 'Agente Comercial Fiserv (Novo)';
