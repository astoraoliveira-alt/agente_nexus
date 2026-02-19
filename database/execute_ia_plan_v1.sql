-- =============================================
-- IA INFRASTRUCTURE: Phase 1 (Execution)
-- Purpose: Dynamic Memory & Outbound Queue
-- =============================================

-- 1. ADICIONAR JANELA DE CONTEXTO DINÂMICA
-- Isso permite parametrizar o 'Memory' do n8n via Dashboard.
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='context_window') THEN
        ALTER TABLE public.agents ADD COLUMN context_window INTEGER DEFAULT 10;
        COMMENT ON COLUMN public.agents.context_window IS 'Define o número de mensagens anteriores que a IA lembrará na conversa (n8n Context Window).';
    END IF;
END $$;

-- 2. CRIAR FILA DE DISPAROS PROATIVOS (Outbound Queue)
-- Para processamento cadenciado via n8n para evitar BAN.
CREATE TABLE IF NOT EXISTS public.outbound_queue (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    contact_name VARCHAR(255),
    contact_phone VARCHAR(50) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb, -- Dados extras do XLS/TXT
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, sent, failed
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance da fila
CREATE INDEX IF NOT EXISTS idx_outbound_queue_status_retry ON public.outbound_queue(status, retry_count) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_outbound_queue_tenant ON public.outbound_queue(tenant_id);

-- 3. RLS PARA A FILA
ALTER TABLE public.outbound_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant Access Outbound Queue" ON public.outbound_queue
FOR ALL USING (tenant_id = (SELECT get_auth_tenant_id()));

-- 4. PERMISSÕES
GRANT ALL ON public.outbound_queue TO authenticated, service_role;

-- 5. VERIFICAÇÃO
DO $$ 
BEGIN 
    RAISE NOTICE 'IA Infrastructure DB Execution Complete: Janela de Contexto adicionada e Fila de Disparos criada.';
END $$;
