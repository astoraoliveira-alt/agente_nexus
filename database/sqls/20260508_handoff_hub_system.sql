-- Migração: Criação da Tabela de Gestão de Handoff (Transição Humana)
-- Descrição: Gerencia a fila de espera para atendimento humano separada da carga técnica de leads.

-- 1. Criação da Tabela
CREATE TABLE IF NOT EXISTS public.handoff_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.companies(id),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id),
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES public.agent_leads(id) ON DELETE SET NULL,
    
    -- Status da Transição
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'resolved', 'ignored')),
    priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    
    -- Dados do Pedido
    initial_message TEXT, -- A frase que disparou o handoff
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Dados do Atendimento
    handled_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    operator_id UUID, -- Usuário que assumiu o atendimento
    
    -- Metadados Adicionais
    metadata JSONB DEFAULT '{}'::JSONB,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar Realtime para esta tabela
ALTER PUBLICATION supabase_realtime ADD TABLE handoff_requests;

-- 3. Índices para Performance
CREATE INDEX IF NOT EXISTS idx_handoff_tenant_status ON public.handoff_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_handoff_conversation ON public.handoff_requests(conversation_id);
CREATE INDEX IF NOT EXISTS idx_handoff_requested_at ON public.handoff_requests(requested_at DESC);

-- 4. Trigger para update de timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_handoff_requests_updated_at
    BEFORE UPDATE ON handoff_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. Função RPC para o n8n logar o pedido de forma atômica
CREATE OR REPLACE FUNCTION public.log_handoff_request(
    p_tenant_id UUID,
    p_conversation_id UUID,
    p_campaign_id UUID DEFAULT NULL,
    p_lead_id UUID DEFAULT NULL,
    p_initial_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID AS $$
DECLARE
    v_handoff_id UUID;
BEGIN
    -- Insere o pedido na fila
    INSERT INTO public.handoff_requests (
        tenant_id,
        conversation_id,
        campaign_id,
        lead_id,
        initial_message,
        metadata
    ) VALUES (
        p_tenant_id,
        p_conversation_id,
        p_campaign_id,
        p_lead_id,
        p_initial_message,
        p_metadata
    )
    RETURNING id INTO v_handoff_id;

    -- Opcional: Atualiza o status da conversa para human_active imediatamente se desejado
    -- UPDATE public.conversations SET status = 'human_active' WHERE id = p_conversation_id;

    RETURN v_handoff_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.handoff_requests IS 'Tabela central de gestão de transição de IA para Humano (Handoff Hub).';
