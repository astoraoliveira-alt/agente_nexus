-- 20260511_create_agent_leads.sql
-- Criação da tabela agent_leads para gestão de contatos e conversões

CREATE TABLE IF NOT EXISTS public.agent_leads (
  id uuid NOT NULL DEFAULT gen_random_uuid (),
  tenant_id uuid NOT NULL,
  campaign_id uuid NULL,
  identifier character varying(50) NOT NULL,
  identifier_type character varying(20) NULL DEFAULT 'cnpj'::character varying,
  name text NULL,
  whatsapp character varying(20) NULL,
  cta_link text NULL,
  status character varying(20) NULL DEFAULT 'pending'::character varying,
  metadata jsonb NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT agent_leads_pkey PRIMARY KEY (id),
  CONSTRAINT agent_leads_tenant_id_identifier_campaign_id_key UNIQUE (tenant_id, identifier, campaign_id),
  CONSTRAINT agent_leads_unique_tenant_identifier UNIQUE (tenant_id, identifier),
  CONSTRAINT agent_leads_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
  CONSTRAINT agent_leads_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES companies (id)
) TABLESPACE pg_default;

-- Habilitar RLS (Segurança)
ALTER TABLE public.agent_leads ENABLE ROW LEVEL SECURITY;

-- Política de Acesso (Seguindo o padrão do projeto)
DROP POLICY IF EXISTS "Tenant Access Agent Leads" ON public.agent_leads;
CREATE POLICY "Tenant Access Agent Leads" ON public.agent_leads
FOR ALL 
TO authenticated
USING (tenant_id = get_auth_tenant_id())
WITH CHECK (tenant_id = get_auth_tenant_id());

-- Índices para Performance
CREATE INDEX IF NOT EXISTS idx_agent_leads_tenant ON public.agent_leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_leads_campaign ON public.agent_leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_agent_leads_identifier ON public.agent_leads(identifier);
