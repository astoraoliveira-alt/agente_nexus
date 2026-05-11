-- 📋 TABELA DE INCIDENTES E COMUNICADOS (V1.0)
-- Permite que o tenant cadastre problemas sistêmicos e configure respostas automáticas ou broadcasts.

CREATE TABLE IF NOT EXISTS public.system_incidents (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    problem_description TEXT NOT NULL,
    response_message TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('active', 'passive', 'both')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    created_by UUID
);

-- Habilitar RLS
ALTER TABLE public.system_incidents ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso
DROP POLICY IF EXISTS "Tenants can view their own incidents" ON public.system_incidents;
CREATE POLICY "Tenants can view their own incidents"
    ON public.system_incidents FOR SELECT
    USING (
        tenant_id = public.get_auth_tenant()
        OR 
        public.is_super_admin()
    );

DROP POLICY IF EXISTS "Tenants can manage their own incidents" ON public.system_incidents;
CREATE POLICY "Tenants can manage their own incidents"
    ON public.system_incidents FOR ALL
    USING (
        tenant_id = public.get_auth_tenant()
        OR 
        public.is_super_admin()
    )
    WITH CHECK (
        tenant_id = public.get_auth_tenant()
        OR 
        public.is_super_admin()
    );

DROP POLICY IF EXISTS "Tenants can insert their own incidents" ON public.system_incidents;
CREATE POLICY "Tenants can insert their own incidents"
    ON public.system_incidents FOR INSERT
    WITH CHECK (
        tenant_id = public.get_auth_tenant()
        OR 
        public.is_super_admin()
    );

-- Índices para Performance
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_status ON public.system_incidents(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_incidents_campaign ON public.system_incidents(campaign_id);

COMMENT ON TABLE public.system_incidents IS 'Tabela para gestão de incidentes sistêmicos e comunicados de campanha.';
