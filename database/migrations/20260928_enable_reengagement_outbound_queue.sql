-- Migration: 20260928_enable_reengagement_outbound_queue.sql
-- Description: Permite múltiplos envios na mesma campanha para histórico de reengajamento,
-- garantindo que nunca existam dois registros PENDENTES ou PROCESSANDO simultâneos para o mesmo celular.

-- 1. Remove restrições únicas legadas que impediam múltiplos envios para o mesmo telefone na mesma campanha
ALTER TABLE public.outbound_queue DROP CONSTRAINT IF EXISTS unique_campaign_phone;
ALTER TABLE public.outbound_queue DROP CONSTRAINT IF EXISTS outbound_queue_campaign_id_contact_phone_key;

-- 2. Cria índice único parcial para garantir que NÃO existam dois envios PENDENTES ou EM PROCESSAMENTO
-- simultâneos para o mesmo celular na mesma campanha (proteção estrita contra disparos paralelos)
DROP INDEX IF EXISTS uq_outbound_queue_pending_phone;
CREATE UNIQUE INDEX IF NOT EXISTS uq_outbound_queue_pending_phone 
ON public.outbound_queue (campaign_id, contact_phone) 
WHERE status IN ('pending', 'processing');

COMMENT ON INDEX uq_outbound_queue_pending_phone IS 'Permite múltiplos envios históricos na mesma campanha mantendo o histórico original, e impede duplicatas simultâneas ativas na fila.';
