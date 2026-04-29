-- REPARO: Sincroniza status de mensagens já enviadas com a fila de outbound
-- Execute isto após aplicar o fix_message_status_sync.sql

UPDATE public.outbound_queue oq
SET status = LOWER(m.status)
FROM public.messages m
WHERE (oq.metadata->>'message_id')::uuid = m.id
  AND oq.status = 'sent'
  AND m.status IN ('DELIVERED', 'delivered', 'READ', 'read', 'DELIVERY_ACK', 'delivery_ack');

-- Força atualização das métricas da campanha
SELECT public.fn_sync_campaign_stats(id) FROM public.campaigns WHERE status = 'active';
