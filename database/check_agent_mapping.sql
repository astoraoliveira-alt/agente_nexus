-- =============================================
-- VERIFICAÇÃO DE MAPEAMENTO (EXECUTE NO SUPABASE)
-- Verifique se o nome da instância (n8n-aegea) está cadastrado corretamente.
-- =============================================

SELECT id, name, tenant_id, evolution_instance, status
FROM agents
WHERE evolution_instance = 'n8n-aegea'; -- Troque pelo nome que aparece no log se for diferente

-- Se o SELECT acima retornar VAZIO, o n8n nunca vai encontrar o agent_id.
-- Use o comando abaixo para corrigir o agente manualmente:

-- UPDATE agents 
-- SET evolution_instance = 'n8n-aegea' 
-- WHERE id = 'ID_DO_AGENTE_AQUI';
