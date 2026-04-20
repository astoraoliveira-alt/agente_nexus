-- ============================================================
-- RPC: fn_sync_campaign_stats
-- Descrição: Recalcula e sincroniza os contadores da tabela campaigns
-- com base no estado real da outbound_queue.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_sync_campaign_stats(p_campaign_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_contacts INT;
    v_sent_count INT;
    v_failed_count INT;
    v_delivered_count INT;
    v_processed_count INT;
BEGIN
    -- 1. Contagem Real na Fila
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'read')),
        COUNT(*) FILTER (WHERE status = 'failed'),
        COUNT(*) FILTER (WHERE status IN ('delivered', 'read')),
        COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'read', 'failed', 'processing'))
    INTO 
        v_total_contacts,
        v_sent_count,
        v_failed_count,
        v_delivered_count,
        v_processed_count
    FROM public.outbound_queue
    WHERE campaign_id = p_campaign_id;

    -- 2. Atualiza a tabela de Campanhas
    -- Garante que a coluna existe antes (Segurança)
    BEGIN
        ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS delivered_count INT DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;

    UPDATE public.campaigns
    SET 
        total_contacts = v_total_contacts,
        sent_count = v_sent_count,
        failed_count = v_failed_count,
        delivered_count = v_delivered_count,
        updated_at = NOW()
    WHERE id = p_campaign_id;

    RETURN jsonb_build_object(
        'success', true,
        'campaign_id', p_campaign_id,
        'total_contacts', v_total_contacts,
        'sent_count', v_sent_count,
        'failed_count', v_failed_count,
        'delivered_count', v_delivered_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_sync_campaign_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sync_campaign_stats(UUID) TO service_role;
