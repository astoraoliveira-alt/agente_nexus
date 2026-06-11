-- ==============================================================
-- REENGAJAMENTO MANUAL - CAMPANHA 01fbb8ff-8408-4980-b0be-59202e3e3291
-- Data: 2026-06-09 (v2 - regra simplificada)
-- Objetivo: Reenviar para TODOS que receberam a mensagem,
--   excluindo APENAS quem já converteu.
--   Inclui quem respondeu, quem não respondeu, quem está em
--   atendimento — a única proteção é a conversão.
-- Conta alvo: ~2.139 leads (2.343 entregues - 204 convertidos)
-- ==============================================================

-- ⚠️  PASSO 0: AUDITORIA ANTES
--   Execute só este bloco primeiro para ver o que será afetado.

SELECT
    status,
    COALESCE(oq.metadata->>'converted', 'false') AS converted_flag,
    COUNT(*) AS total
FROM public.outbound_queue oq
WHERE campaign_id = '01fbb8ff-8408-4980-b0be-59202e3e3291'
GROUP BY status, converted_flag
ORDER BY status;

-- ==============================================================
-- ⚠️  PASSO 1: REENGAJAMENTO
--   Regra: recebeu a mensagem (sent/delivered/read) E não converteu.
--   Não importa se respondeu ou não.
-- ==============================================================

DO $$
DECLARE
    v_campaign_id UUID := '01fbb8ff-8408-4980-b0be-59202e3e3291';
    v_updated     INT;
BEGIN

    UPDATE public.outbound_queue oq
    SET
        status                     = 'pending',
        reengagement_attempt_count = COALESCE(oq.reengagement_attempt_count, 0) + 1,
        reengagement_last_sent_at  = NOW(),
        scheduled_at               = NOW(),   -- dispara imediatamente ao próximo ciclo do scheduler
        last_attempt_at            = NULL,    -- limpa trava de retry
        error_message              = NULL
    WHERE
        oq.campaign_id = v_campaign_id

        -- ✅ Só quem efetivamente recebeu a mensagem
        AND oq.status IN ('sent', 'delivered', 'read')

        -- 🚫 EXCLUSÃO 1: status direto de conversão na fila
        AND oq.status != 'converted'
        AND COALESCE(oq.metadata->>'converted', 'false') != 'true'

        -- 🚫 EXCLUSÃO 2: conversão registrada via mensagem na conversa
        AND NOT EXISTS (
            SELECT 1
            FROM public.messages m
            WHERE m.conversation_id = oq.conversation_id
              AND (
                  m.content ILIKE '%[CONVERSÃO]%'
                  OR m.content ILIKE '%✅ [CONVERSÃO]%'
              )
              AND m.created_at >= COALESCE(oq.sent_at, oq.created_at)
        );

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE '✅ Leads recolocados para reengajamento: %', v_updated;

    -- Sincroniza contadores do dashboard
    PERFORM public.fn_sync_campaign_stats(v_campaign_id);
    RAISE NOTICE '✅ Estatísticas da campanha sincronizadas.';

END $$;

-- ==============================================================
-- ⚠️  PASSO 2: AUDITORIA DEPOIS — confira que o total de 'pending'
--   subiu e 'converted' permaneceu intocado.
-- ==============================================================

SELECT
    status,
    COALESCE(oq.metadata->>'converted', 'false') AS converted_flag,
    COUNT(*) AS total
FROM public.outbound_queue oq
WHERE campaign_id = '01fbb8ff-8408-4980-b0be-59202e3e3291'
GROUP BY status, converted_flag
ORDER BY status;
