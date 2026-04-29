-- =============================================
-- SCRIPT DE RESET (LIMPEZA TOTAL DE CONVERSAS)
-- ATENÇÃO: ISSO APAGARÁ TODAS AS CONVERSAS E MENSAGENS!
-- Use com cuidado.
-- =============================================

-- 1. Limpar Mensagens (Dependentes de Conversas)
TRUNCATE TABLE messages CASCADE;

-- 2. Limpar Conversas
TRUNCATE TABLE conversations CASCADE;

-- 3. (Opcional) Limpar Métricas de Consumo
-- Se quiser zerar também os custos/tokens, descomente a linha abaixo:
TRUNCATE TABLE consumption_metrics CASCADE;

-- 4. Resetar status dos Agentes (Zerar contadores de conversas ativas se necessário)
-- Nota: Os contadores de 'active_conversations' em 'agents' não são calculados automaticamente por trigger neste schema (normalmente).
-- Se houver contadores denormalizados, rodar:
UPDATE agents SET active_conversations = 0, total_conversations = 0;
