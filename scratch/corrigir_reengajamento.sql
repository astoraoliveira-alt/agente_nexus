-- ==============================================================================
-- Script Corretivo para Reenvio de Engajamento da Campanha "Disparo 01.06"
-- Resolve o bloqueio de "Mensagem Duplicada" (Idempotência)
-- ==============================================================================

BEGIN;

WITH target_campaign AS (
    SELECT id 
    FROM public.campaigns 
    WHERE name ILIKE '%Disparo 01.06%' 
    LIMIT 1
)
UPDATE public.outbound_queue
SET 
    status = 'pending',
    retry_count = 0,
    error_message = NULL,
    scheduled_at = NOW(),
    sent_at = NULL,
    last_attempt_at = NULL,
    dedup_at = NULL,
    
    -- Incrementa a tentativa de reengajamento para o faturamento (Billing) separar corretamente
    reengagement_attempt_count = 1,
    
    -- [CRÍTICO] Atualiza a chave de idempotência para burlar o bloqueio de anti-duplicidade
    idempotency_key = campaign_id || ':' || contact_phone || ':reengajamento_1'
WHERE 
    campaign_id = (SELECT id FROM target_campaign)
    AND status = 'deduplicated';

COMMIT;
