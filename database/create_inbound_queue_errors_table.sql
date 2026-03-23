-- =============================================== --
-- DAVOS NEXUS - INBOUND QUEUE ERRORS LOG TABLE    --
-- =============================================== --

-- 1. Create the Exclusive Errors Table
CREATE TABLE IF NOT EXISTS public.inbound_queue_errors (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    queue_id uuid REFERENCES public.inbound_queue(id) ON DELETE SET NULL,
    tenant_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
    agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
    conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
    trace_id varchar,
    external_id varchar,
    sequence_number int,
    payload jsonb,
    error_message text NOT NULL,
    status text,
    created_at timestamp WITH TIME ZONE DEFAULT now()
);

-- 2. Indexes for Performance (Metrics and Dashboards)
CREATE INDEX IF NOT EXISTS idx_inb_queue_err_tenant_created 
ON public.inbound_queue_errors (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inb_queue_err_queue_id
ON public.inbound_queue_errors (queue_id);

-- 3. Trigger Function to Track Errors Automagically
CREATE OR REPLACE FUNCTION public.fn_track_inbound_queue_errors()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Se o registro foi atualizado e indicou falha (mudança de status para failed/error ou error_message preenchido/alterado)
    IF (NEW.status IN ('failed', 'error') AND (OLD.status NOT IN ('failed', 'error') OR OLD.status IS NULL))
       OR
       (NEW.error_message IS NOT NULL AND (OLD.error_message IS NULL OR NEW.error_message <> OLD.error_message))
    THEN
        INSERT INTO public.inbound_queue_errors (
            queue_id, tenant_id, agent_id, conversation_id,
            trace_id, external_id, sequence_number, payload, 
            error_message, status
        ) VALUES (
            NEW.id, NEW.tenant_id, NEW.agent_id, NEW.conversation_id,
            NEW.trace_id, NEW.external_id, NEW.sequence_number, NEW.payload, 
            COALESCE(NEW.error_message, 'ERRO DESCONHECIDO (SEM DETALHES)'), NEW.status
        );
    END IF;
    
    RETURN NEW;
END;
$$;

-- 4. Attach Trigger to Inbound Queue
DROP TRIGGER IF EXISTS trg_track_inbound_queue_errors ON public.inbound_queue;
CREATE TRIGGER trg_track_inbound_queue_errors
AFTER UPDATE ON public.inbound_queue
FOR EACH ROW
EXECUTE FUNCTION public.fn_track_inbound_queue_errors();

-- 5. Comments
COMMENT ON TABLE public.inbound_queue_errors IS 'Tabela exclusiva para rastreabilidade de erros da inbound_queue, mantém o log mesmo após reprocessamento (retries).';
