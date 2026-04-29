-- ==========================================================
-- SISTEMA DE RASTREABILIDADE ELITE (TRACE-ID & LOGS)
-- ==========================================================

-- 1. Tabela Central de Logs e Erros
CREATE TABLE IF NOT EXISTS public.system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id VARCHAR(100),              -- O "Fio Vermelho"
    tenant_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    component VARCHAR(50) NOT NULL,     -- 'PORTEIRO', 'N8N', 'DATABASE_RPC', 'FRONTEND'
    severity VARCHAR(20) DEFAULT 'INFO', -- 'INFO', 'WARN', 'ERROR', 'CRITICAL'
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb, -- Payload completo para debug
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para busca ultra-rápida por Trace ID
CREATE INDEX IF NOT EXISTS idx_system_logs_trace_id ON public.system_logs(trace_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_tenant_date ON public.system_logs(tenant_id, created_at);

-- 2. Adição de Trace ID nas Filas Existentes
ALTER TABLE public.inbound_queue ADD COLUMN IF NOT EXISTS trace_id VARCHAR(100);
ALTER TABLE public.outbound_queue ADD COLUMN IF NOT EXISTS trace_id VARCHAR(100);

-- 3. Função Auxiliar para Gravar Logs via RPC (Útil para o n8n e Banco)
CREATE OR REPLACE FUNCTION public.fn_log_event(
    p_tenant_id UUID,
    p_trace_id VARCHAR,
    p_component VARCHAR,
    p_severity VARCHAR,
    p_message TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_agent_id UUID DEFAULT NULL,
    p_conversation_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO public.system_logs (
        tenant_id, trace_id, component, severity, message, metadata, agent_id, conversation_id
    ) VALUES (
        p_tenant_id, p_trace_id, p_component, p_severity, p_message, p_metadata, p_agent_id, p_conversation_id
    ) RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.system_logs IS 'Cofre central de rastreabilidade e erros da Davos Nexus (Trace-ID System).';
