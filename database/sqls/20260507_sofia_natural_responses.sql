-- ======================================================== --
-- DAVOS NEXUS - SYSTEM PROMPT UPDATE FOR NATURAL RESPONSES --
-- Remove "Entendo sua dúvida" and similar robotic starts   --
-- ======================================================== --

UPDATE public.agents
SET brain_config = jsonb_set(
    brain_config,
    '{systemPrompt}',
    to_jsonb(
        REPLACE(
            REPLACE(
                brain_config->>'systemPrompt',
                '1. Começar com nome + 1 emoji contextual (Ex: "Astor, perfeito. 🍞")',
                '1. Começar com um marcador de naturalidade (Ex: "Certo", "Entendi", "Perfeito", "Vamos lá") + Nome + 1 emoji contextual.'
            ),
            '3. Blocos curtos (máx 2 linhas)',
            '2. PROIBIDO: Iniciar com frases robóticas ou clichês de IA como "Entendo sua dúvida" ou "Entendo sua preocupação". Seja direta e humana.' || chr(10) || '3. Blocos curtos (máx 2 linhas)'
        )
    )
)
WHERE name IN (
    'Venda de Crédito Whatss', 
    'Sofia', 
    'Agente de Vendas', 
    'Consultor Oficial Ticket', 
    'Agente Fiserv - Determinístico'
);
