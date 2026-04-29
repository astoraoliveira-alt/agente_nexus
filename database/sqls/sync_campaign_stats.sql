-- Sincronizar contadores de campanhas com base na realidade da fila de outbound
UPDATE public.campaigns c
SET 
    total_contacts = (
        SELECT count(*) 
        FROM public.outbound_queue q 
        WHERE q.campaign_id = c.id
    ),
    sent_count = (
        SELECT count(*) 
        FROM public.outbound_queue q 
        WHERE q.campaign_id = c.id 
        AND q.status IN ('sent', 'failed') -- Consideramos tentativas realizadas
    ),
    response_count = (
        SELECT count(*) 
        FROM public.outbound_queue q 
        WHERE q.campaign_id = c.id 
        AND q.response_detected = TRUE
    ),
    updated_at = NOW();

-- Garantir que não haja nulos
UPDATE public.campaigns SET total_contacts = 0 WHERE total_contacts IS NULL;
UPDATE public.campaigns SET sent_count = 0 WHERE sent_count IS NULL;
UPDATE public.campaigns SET response_count = 0 WHERE response_count IS NULL;
