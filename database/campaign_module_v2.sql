-- 1. GARANTIR EXTENSÕES E INTEGRIDADE DE REFERÊNCIA
DO $$ 
BEGIN 
    -- Garantir extensão de UUID
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- Garantir que companies tenha Primary Key
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_schema = 'public' AND table_name = 'companies' AND constraint_type = 'PRIMARY KEY'
    ) THEN
        BEGIN
            ALTER TABLE public.companies ADD PRIMARY KEY (id);
        EXCEPTION WHEN OTHERS THEN 
            RAISE NOTICE 'Não foi possível adicionar PK a companies automaticamente.';
        END;
    END IF;

    -- Garantir que agents tenha Primary Key
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_schema = 'public' AND table_name = 'agents' AND constraint_type = 'PRIMARY KEY'
    ) THEN
        BEGIN
            ALTER TABLE public.agents ADD PRIMARY KEY (id);
        EXCEPTION WHEN OTHERS THEN 
            RAISE NOTICE 'Não foi possível adicionar PK a agents automaticamente.';
        END;
    END IF;

    -- Criar ENUM de Status se não existir
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_status') THEN
        CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'paused', 'completed', 'cancelled');
    END IF;

    -- Garantir acesso ao ENUM
    GRANT USAGE ON TYPE public.campaign_status TO authenticated, service_role;
END $$;

-- 2. CRIAR TABELA DE CAMPANHAS
CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status campaign_status DEFAULT 'draft',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    start_time TEXT DEFAULT '09:00',
    end_time TEXT DEFAULT '18:00',
    initial_message TEXT,
    daily_limit INTEGER DEFAULT 50,
    total_contacts INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    response_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. CRIAR FILA DE DISPAROS SE NÃO EXISTIR (Auto-suficiente)
CREATE TABLE IF NOT EXISTS public.outbound_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    contact_name VARCHAR(255),
    contact_phone VARCHAR(50) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. EVOLUIR A FILA PARA SUPORTAR CAMPANHAS
DO $$ 
BEGIN 
    -- Link com a campanha
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='outbound_queue' AND column_name='campaign_id') THEN
        ALTER TABLE public.outbound_queue ADD COLUMN campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE;
    END IF;

    -- Flag de resposta
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='outbound_queue' AND column_name='response_detected') THEN
        ALTER TABLE public.outbound_queue ADD COLUMN response_detected BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- Controle de limite
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='outbound_queue' AND column_name='last_attempt_at') THEN
        ALTER TABLE public.outbound_queue ADD COLUMN last_attempt_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- 5. RLS E SEGURANÇA
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Access Campaigns" ON public.campaigns;
CREATE POLICY "Tenant Access Campaigns" ON public.campaigns
FOR ALL 
TO authenticated
USING (
    tenant_id = get_auth_tenant_id() 
    OR 
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
)
WITH CHECK (
    tenant_id = get_auth_tenant_id() 
    OR 
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

DROP POLICY IF EXISTS "Tenant Access Outbound Queue" ON public.outbound_queue;
CREATE POLICY "Tenant Access Outbound Queue" ON public.outbound_queue
FOR ALL 
TO authenticated
USING (
    tenant_id = get_auth_tenant_id() 
    OR 
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
)
WITH CHECK (
    tenant_id = get_auth_tenant_id() 
    OR 
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

-- 6. PERMISSÕES
GRANT ALL ON public.campaigns TO authenticated, service_role;
GRANT ALL ON public.outbound_queue TO authenticated, service_role;

-- 7. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON public.campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbound_queue_tenant ON public.outbound_queue(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbound_campaign ON public.outbound_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_outbound_queue_status_retry ON public.outbound_queue(status, retry_count) WHERE status = 'pending';

COMMENT ON TABLE public.campaigns IS 'Gerencia campanhas de outbound proativo com controle de volume e tracking.';
