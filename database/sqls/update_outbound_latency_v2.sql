-- ========================================================== --
-- FIX: LATENCY TRACKING FOR OUTBOUND SIGNALS (AI RESPONSES) --
-- ========================================================== --

-- 1. Update the Outbound Traceability Trigger to calculate latency
-- This ensures that AI responses show real processing time in the Observatory
CREATE OR REPLACE FUNCTION public.trg_log_outbound_to_integration_logs()
RETURNS TRIGGER AS $$
DECLARE
    v_latency_sec INTEGER;
    v_latency_ms INTEGER;
BEGIN
    -- Log only when status reaches a final state (sent or failed)
    IF (NEW.status = 'sent' OR NEW.status = 'failed') AND (OLD.status IS NULL OR OLD.status != NEW.status) THEN
        
        -- Calculate latency in milliseconds (delta between creation and finalization)
        -- We use EXTRACT(EPOCH FROM ...) to get seconds, then convert to MS
        v_latency_ms := (EXTRACT(EPOCH FROM (COALESCE(NEW.sent_at, NOW()) - NEW.created_at)) * 1000)::INTEGER;

        INSERT INTO public.integration_logs (
            provider,
            external_id,
            tenant_id,
            agent_id,
            campaign_id,
            conversation_id,
            status,
            trace_id,
            latency_ms,
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
            NEW.trace_id,
            v_latency_ms,
            jsonb_build_object(
                'contact_name', NEW.contact_name,
                'contact_phone', NEW.contact_phone,
                'retry_count', NEW.retry_count,
                'sent_at', NEW.sent_at,
                'created_at', NEW.created_at,
                'latency_ms', v_latency_ms,
                'error_message', NEW.error_message
            ),
            NEW.error_message,
            NOW()
        )
        ON CONFLICT (provider, external_id) DO UPDATE SET
            status = EXCLUDED.status,
            latency_ms = EXCLUDED.latency_ms,
            payload = integration_logs.payload || EXCLUDED.payload,
            error_details = EXCLUDED.error_details,
            processed_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.trg_log_outbound_to_integration_logs IS 'Calcula automaticamente a latência de processamento da IA para visibilidade no Observatório.';
