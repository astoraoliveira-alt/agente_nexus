-- ============================================================
-- MIGRATION: Campaign Dispatch Audits & Lead Selection Trail
-- Date: 2026-09-28
-- Description:
--   Cria tabela para auditoria detalhada de cargas de campanha.
--   Registra o que foi carregado originalmente, o que foi selecionado
--   para envio pelo operador e o que foi desmarcado, com o motivo
--   detalhado (recusa recente <60d, falha de entrega anterior, desmarcado manualmente).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.campaign_dispatch_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    imported_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    file_name TEXT,
    total_uploaded INTEGER NOT NULL DEFAULT 0,
    total_sent INTEGER NOT NULL DEFAULT 0,
    total_skipped INTEGER NOT NULL DEFAULT 0,
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    records JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_dispatch_audits_tenant_campaign 
    ON public.campaign_dispatch_audits(tenant_id, campaign_id);

CREATE INDEX IF NOT EXISTS idx_dispatch_audits_created_at 
    ON public.campaign_dispatch_audits(created_at DESC);

-- Políticas RLS Multi-tenant
ALTER TABLE public.campaign_dispatch_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow tenant access on campaign_dispatch_audits" ON public.campaign_dispatch_audits;
CREATE POLICY "Allow tenant access on campaign_dispatch_audits"
    ON public.campaign_dispatch_audits
    FOR ALL
    TO authenticated
    USING (
        tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
        OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
    )
    WITH CHECK (
        tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
        OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
    );

DROP POLICY IF EXISTS "Allow service_role full access on campaign_dispatch_audits" ON public.campaign_dispatch_audits;
CREATE POLICY "Allow service_role full access on campaign_dispatch_audits"
    ON public.campaign_dispatch_audits
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

GRANT ALL ON public.campaign_dispatch_audits TO authenticated, service_role;

COMMENT ON TABLE public.campaign_dispatch_audits IS 'Histórico e auditoria de cargas de campanhas com decisões de envio e motivos de exclusão.';
