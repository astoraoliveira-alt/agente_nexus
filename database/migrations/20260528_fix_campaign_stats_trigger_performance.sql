-- ==========================================================
-- Migration: Fix Campaign Stats Trigger Performance
-- Description: Replaces the O(N) COUNT(*) trigger with an O(1) delta update
-- to prevent statement timeouts during bulk imports (e.g., 1000 contacts).
-- ==========================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_sync_campaign_stats()
RETURNS TRIGGER AS $$
DECLARE
    v_campaign_id UUID;
    v_diff_total INT := 0;
    v_diff_sent INT := 0;
    v_diff_failed INT := 0;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_campaign_id := NEW.campaign_id;
        v_diff_total := 1;
        IF NEW.status = 'sent' THEN v_diff_sent := 1; END IF;
        IF NEW.status = 'failed' THEN v_diff_failed := 1; END IF;
    ELSIF TG_OP = 'DELETE' THEN
        v_campaign_id := OLD.campaign_id;
        v_diff_total := -1;
        IF OLD.status = 'sent' THEN v_diff_sent := -1; END IF;
        IF OLD.status = 'failed' THEN v_diff_failed := -1; END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        v_campaign_id := NEW.campaign_id;
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            IF OLD.status = 'sent' THEN v_diff_sent := -1; END IF;
            IF OLD.status = 'failed' THEN v_diff_failed := -1; END IF;
            
            IF NEW.status = 'sent' THEN v_diff_sent := 1; END IF;
            IF NEW.status = 'failed' THEN v_diff_failed := 1; END IF;
        END IF;
    END IF;

    IF v_campaign_id IS NOT NULL AND (v_diff_total <> 0 OR v_diff_sent <> 0 OR v_diff_failed <> 0) THEN
        UPDATE public.campaigns
        SET 
            sent_count = COALESCE(sent_count, 0) + v_diff_sent,
            failed_count = COALESCE(failed_count, 0) + v_diff_failed,
            total_contacts = COALESCE(total_contacts, 0) + v_diff_total,
            updated_at = NOW()
        WHERE id = v_campaign_id;
    END IF;
    
    RETURN NULL; -- For AFTER trigger
END;
$$ LANGUAGE plpgsql;

-- O trigger existente `trg_sync_campaign_stats` continuará usando a mesma função, 
-- mas agora com execução instantânea (O(1)) sem travar o banco.

COMMIT;
