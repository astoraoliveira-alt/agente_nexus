-- 🛡️ CAMPAIGN OBSERVABILITY & TRACEABILITY (V52)
-- Centralizes errors in integration_logs and fixes campaign statistics

-- 1. Ensure integration_logs has all traceability columns
ALTER TABLE public.integration_logs 
ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id),
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id),
ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id),
ADD COLUMN IF NOT EXISTS trace_id TEXT,
ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'POST',
ADD COLUMN IF NOT EXISTS path TEXT,
ADD COLUMN IF NOT EXISTS validation_results JSONB DEFAULT '{}'::jsonb;

-- 2. Define the Campaign Statistics Sync Function
-- This function recalculates sent/failed/total counts for a campaign
CREATE OR REPLACE FUNCTION public.fn_sync_campaign_stats()
RETURNS TRIGGER AS $$
DECLARE
    v_campaign_id UUID;
BEGIN
    v_campaign_id := COALESCE(NEW.campaign_id, OLD.campaign_id);
    
    IF v_campaign_id IS NOT NULL THEN
        UPDATE public.campaigns
        SET 
            sent_count = (SELECT count(*) FROM public.outbound_queue WHERE campaign_id = v_campaign_id AND status = 'sent'),
            failed_count = (SELECT count(*) FROM public.outbound_queue WHERE campaign_id = v_campaign_id AND status = 'failed'),
            total_contacts = (SELECT count(*) FROM public.outbound_queue WHERE campaign_id = v_campaign_id),
            updated_at = NOW()
        WHERE id = v_campaign_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach Trigger to outbound_queue
DROP TRIGGER IF EXISTS trg_sync_campaign_stats ON public.outbound_queue;
CREATE TRIGGER trg_sync_campaign_stats
AFTER INSERT OR UPDATE OF status OR DELETE ON public.outbound_queue
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_campaign_stats();

-- 3. Define the Outbound Traceability Trigger
-- Automatically creates a record in integration_logs when a message is sent or fails
CREATE OR REPLACE FUNCTION public.trg_log_outbound_to_integration_logs()
RETURNS TRIGGER AS $$
BEGIN
    -- Log only when status reaches a final state (sent or failed)
    IF (NEW.status = 'sent' OR NEW.status = 'failed') AND (OLD.status IS NULL OR OLD.status != NEW.status) THEN
        INSERT INTO public.integration_logs (
            provider,
            external_id,
            tenant_id,
            agent_id,
            campaign_id,
            conversation_id,
            status,
            payload,
            error_details,
            processed_at
        ) VALUES (
            'outbound', 
            'QUEUE-' || NEW.id,
            NEW.tenant_id,
            NEW.agent_id,
            NEW.campaign_id,
            NEW.conversation_id,
            NEW.status,
            jsonb_build_object(
                'contact_name', NEW.contact_name,
                'contact_phone', NEW.contact_phone,
                'retry_count', NEW.retry_count,
                'sent_at', NEW.sent_at,
                'scheduled_at', NEW.scheduled_at,
                'error_message', NEW.error_message
            ),
            NEW.error_message,
            NOW()
        )
        ON CONFLICT (provider, external_id) DO UPDATE SET
            status = EXCLUDED.status,
            payload = integration_logs.payload || EXCLUDED.payload,
            error_details = EXCLUDED.error_details,
            processed_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach Trigger for Audit Trail
DROP TRIGGER IF EXISTS trg_log_outbound_status ON public.outbound_queue;
CREATE TRIGGER trg_log_outbound_status
AFTER UPDATE OF status ON public.outbound_queue
FOR EACH ROW
EXECUTE FUNCTION public.trg_log_outbound_to_integration_logs();

-- 4. Initial Sync: Recalculate all campaign stats to fix legacy data
UPDATE public.campaigns c
SET 
    sent_count = (SELECT count(*) FROM public.outbound_queue q WHERE q.campaign_id = c.id AND q.status = 'sent'),
    failed_count = (SELECT count(*) FROM public.outbound_queue q WHERE q.campaign_id = c.id AND q.status = 'failed'),
    total_contacts = (SELECT count(*) FROM public.outbound_queue q WHERE q.campaign_id = c.id);

COMMENT ON TRIGGER trg_log_outbound_status ON public.outbound_queue IS 'Garante rastreabilidade total centralizando sucessos e falhas de outbound na integration_logs.';
