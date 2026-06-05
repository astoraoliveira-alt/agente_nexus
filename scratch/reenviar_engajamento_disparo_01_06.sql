-- ==============================================================================
-- Script para Reenvio de Engajamento da Campanha "Disparo 01.06"
-- ==============================================================================
-- Este script irá recolocar na fila de execução todos os leads da campanha 
-- que NÃO tiveram resposta detectada (engajamento nulo).
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
    last_attempt_at = NULL
WHERE 
    campaign_id = (SELECT id FROM target_campaign)
    AND response_detected = FALSE
    -- INCLUI: Entregues, Lidos e Enviados que não responderam. 
    -- SE QUISER INCLUIR OS NÃO ENTREGUES, adicione 'not_delivered' na lista abaixo.
    AND status IN ('read', 'delivered', 'sent', 'not_delivered');

COMMIT;

-- Opcional: Se quiser verificar quantos leads voltaram para 'pending', execute:
-- SELECT status, count(*) 
-- FROM public.outbound_queue 
-- WHERE campaign_id = (SELECT id FROM public.campaigns WHERE name ILIKE '%Disparo 01.06%' LIMIT 1)
-- GROUP BY status;
