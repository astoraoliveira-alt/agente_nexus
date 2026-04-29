-- Migration: Adicionar rastreamento de falhas
-- 1. Adicionar coluna na tabela campaigns
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS failed_count INTEGER DEFAULT 0;

-- 2. Atualizar Trigger Function
CREATE OR REPLACE FUNCTION public.fn_sync_campaign_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        -- Novo contato
        UPDATE public.campaigns
        SET total_contacts = total_contacts + 1
        WHERE id = NEW.campaign_id;
        
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Mudança para SENT
        IF (OLD.status != 'sent' AND NEW.status = 'sent') THEN
            UPDATE public.campaigns
            SET sent_count = sent_count + 1,
                failed_count = CASE WHEN OLD.status = 'failed' THEN failed_count - 1 ELSE failed_count END
            WHERE id = NEW.campaign_id;
        -- Mudança para FAILED
        ELSIF (OLD.status != 'failed' AND NEW.status = 'failed') THEN
            UPDATE public.campaigns
            SET failed_count = failed_count + 1,
                sent_count = CASE WHEN OLD.status = 'sent' THEN sent_count - 1 ELSE sent_count END
            WHERE id = NEW.campaign_id;
        END IF;
        
        -- Detecção de Resposta
        IF (OLD.response_detected = FALSE AND NEW.response_detected = TRUE) THEN
            UPDATE public.campaigns
            SET response_count = response_count + 1
            WHERE id = NEW.campaign_id;
        END IF;

    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE public.campaigns
        SET total_contacts = total_contacts - 1,
            sent_count = CASE WHEN OLD.status = 'sent' THEN sent_count - 1 ELSE sent_count END,
            failed_count = CASE WHEN OLD.status = 'failed' THEN failed_count - 1 ELSE failed_count END,
            response_count = CASE WHEN OLD.response_detected = TRUE THEN response_count - 1 ELSE response_count END
        WHERE id = OLD.campaign_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. Recalcular estatísticas atuais
UPDATE public.campaigns c
SET 
    sent_count = (SELECT COUNT(*) FROM public.outbound_queue WHERE campaign_id = c.id AND status = 'sent'),
    failed_count = (SELECT COUNT(*) FROM public.outbound_queue WHERE campaign_id = c.id AND status = 'failed');
