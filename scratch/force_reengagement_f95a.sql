-- Script para forçar o reengajamento da campanha solicitada
-- INCLUINDO quem respondeu (para pegar os bots automáticos do outro lado)

UPDATE public.outbound_queue oq
SET 
    -- Reseta o contador para garantir que seja puxado pela fila
    reengagement_attempt_count = 0,
    reengagement_last_sent_at = NULL,
    -- Força o sistema a "esquecer" que houve resposta para que a função get_next_leads consiga puxar eles
    response_detected = false,
    -- Devolve do status fantasma de processing se houver
    status = CASE WHEN oq.status = 'processing' THEN 'delivered' ELSE oq.status END
WHERE oq.campaign_id = 'f95a29e3-36cc-499a-9d45-6ab6d6bcb5cf'
  AND oq.status IN ('sent', 'delivered', 'read', 'processing')
  -- Exclui rigorosamente APENAS quem já converteu com sucesso
  AND NOT (
      trim(lower(oq.status)) = 'converted' 
      OR COALESCE(oq.metadata->>'converted', 'false') = 'true'
      OR EXISTS (
          SELECT 1 FROM public.messages m
          WHERE m.conversation_id = oq.conversation_id
            AND (m.content ILIKE '%[CONVERSÃO]%' OR m.content ILIKE '%✅ [CONVERSÃO]%')
      )
  );
