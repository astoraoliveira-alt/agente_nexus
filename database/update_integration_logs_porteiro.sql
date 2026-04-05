-- 🛡️ Update integration_logs for Total Traceability (Porteiro V52)

-- 1. Adicionar colunas necessárias para rastreabilidade profunda
ALTER TABLE public.integration_logs 
ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id),
ADD COLUMN IF NOT EXISTS trace_id TEXT,
ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'POST',
ADD COLUMN IF NOT EXISTS path TEXT,
ADD COLUMN IF NOT EXISTS validation_results JSONB DEFAULT '{}'::jsonb;

-- 2. Indexação para performance de auditoria
CREATE INDEX IF NOT EXISTS idx_integration_logs_agent_id ON public.integration_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_trace_id ON public.integration_logs(trace_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_processed_at ON public.integration_logs(processed_at DESC);

-- 3. Comentários para clareza
COMMENT ON COLUMN public.integration_logs.validation_results IS 'Armazena detalhes de cada etapa de validação (API Key, Herança, Contexto, etc.)';
COMMENT ON COLUMN public.integration_logs.trace_id IS 'ID de rastreio único gerado pelo Porteiro para vincular logs de diferentes sistemas';
