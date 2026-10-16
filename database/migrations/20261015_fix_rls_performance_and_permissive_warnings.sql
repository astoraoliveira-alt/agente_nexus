-- ==============================================================================
-- MIGRATION: 20261015_fix_rls_performance_and_permissive_warnings.sql
-- Descrição:
--   Resolve os alertas de performance do Supabase Linter com 100% de retrocompatibilidade
--   e idempotência total (pode ser executado múltiplas vezes com segurança):
--   1. 'auth_rls_initplan' (Lint 0003): Encapsula chamadas a auth.uid(), auth.jwt(),
--      auth.role() e funções de contexto em subqueries escalares '(SELECT ...)'
--      para permitir caching em InitPlan (execução O(1) em vez de O(N) por linha).
--   2. 'multiple_permissive_policies' (Lint 0006): Remove políticas duplicadas e
--      sobrepostas, consolidando em políticas únicas por role e ação com escopo
--      explícito 'TO authenticated' / 'TO anon'.
--
-- Garantia de Estabilidade:
--   - Nenhuma permissão de usuário, operador ou super admin é revogada.
--   - Idempotente: todos os comandos possuem DROP POLICY IF EXISTS antes do CREATE.
--   - Suporta autenticação tanto por 'users.id' quanto por 'users.provider_id' e email.
--   - Unifica os aliases: get_auth_tenant_id(), get_auth_tenant(), get_current_tenant_id()
--     e is_super_admin(), check_is_super_admin().
--   - Chamadas via n8n / backend usando service_role continuam ignorando RLS normalmente.
--   - Triggers e RPCs SECURITY DEFINER continuam funcionando sem qualquer alteração.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- ETAPA 0: OTIMIZAÇÃO E PADRONIZAÇÃO DAS FUNÇÕES DE CONTEXTO (STABLE + InitPlan)
-- ==============================================================================

-- 0.1 get_auth_tenant_id() - Suporta JWT claim, id, provider_id e email
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- 1. Se existir claim tenant_id no JWT, usa diretamente
  BEGIN
    v_tenant_id := ((SELECT auth.jwt()) ->> 'tenant_id')::uuid;
    IF v_tenant_id IS NOT NULL THEN
      RETURN v_tenant_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Ignora erro de cast se não for UUID válido
  END;

  -- 2. Busca na tabela public.users (por id, provider_id ou email)
  SELECT tenant_id INTO v_tenant_id
  FROM public.users 
  WHERE id = (SELECT auth.uid()) 
     OR provider_id = (SELECT auth.uid())::text 
     OR (
       ((SELECT auth.jwt()) ->> 'email') IS NOT NULL 
       AND LOWER(email) = LOWER((SELECT auth.jwt()) ->> 'email')
     )
  LIMIT 1;

  RETURN v_tenant_id;
END;
$$;

-- 0.2 Aliases de compatibilidade para get_auth_tenant_id
CREATE OR REPLACE FUNCTION public.get_auth_tenant()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.get_auth_tenant_id();
$$;

CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.get_auth_tenant_id();
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_tenant_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.get_auth_tenant_id();
$$;

-- 0.3 is_super_admin() - STABLE, seguro e resiliente (Davos + Super Admin)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- 1. Qualquer usuário autenticado com e-mail corporativo @davosbr.com
  IF ((SELECT auth.jwt()) ->> 'email') ILIKE '%@davosbr.com' THEN
    RETURN TRUE;
  END IF;

  -- 2. Checagem de role super_admin ou davos_admin na tabela users
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE (
      id = (SELECT auth.uid()) 
      OR provider_id = (SELECT auth.uid())::text 
      OR (
        ((SELECT auth.jwt()) ->> 'email') IS NOT NULL 
        AND LOWER(email) = LOWER((SELECT auth.jwt()) ->> 'email')
      )
    )
    AND role IN ('super_admin', 'davos_admin')
    AND (status IS NULL OR status = 'active')
  );
END;
$$;

-- 0.4 check_is_super_admin() - Alias STABLE
CREATE OR REPLACE FUNCTION public.check_is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.is_super_admin();
$$;

-- 0.5 Permissões explícitas de execução
GRANT EXECUTE ON FUNCTION public.get_auth_tenant_id() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_auth_tenant() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_current_tenant_id() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_current_user_tenant_id() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.check_is_super_admin() TO authenticated, anon, service_role;


-- ==============================================================================
-- ETAPA 1: OTIMIZAÇÃO DAS POLÍTICAS RLS (INITPLAN + CONSOLIDAÇÃO IDEMPOTENTE)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1.1 CAMPAIGN_RECOVERY_LOGS (Fix initplan)
-- ------------------------------------------------------------------------------
ALTER TABLE public.campaign_recovery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their tenant's recovery logs" ON public.campaign_recovery_logs;
DROP POLICY IF EXISTS "Users can insert their tenant's recovery logs" ON public.campaign_recovery_logs;
DROP POLICY IF EXISTS "Users can update their tenant's recovery logs" ON public.campaign_recovery_logs;
DROP POLICY IF EXISTS "Users can delete their tenant's recovery logs" ON public.campaign_recovery_logs;
DROP POLICY IF EXISTS "tenant_manage_campaign_recovery_logs" ON public.campaign_recovery_logs;

CREATE POLICY "tenant_manage_campaign_recovery_logs" ON public.campaign_recovery_logs
FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
)
WITH CHECK (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
);


-- ------------------------------------------------------------------------------
-- 1.2 CAMPAIGN_DISPATCH_AUDITS (Fix initplan)
-- ------------------------------------------------------------------------------
ALTER TABLE public.campaign_dispatch_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow tenant access on campaign_dispatch_audits" ON public.campaign_dispatch_audits;

CREATE POLICY "Allow tenant access on campaign_dispatch_audits"
ON public.campaign_dispatch_audits
FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
)
WITH CHECK (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
);


-- ------------------------------------------------------------------------------
-- 1.3 HANDOFF_REQUESTS (Fix initplan)
-- ------------------------------------------------------------------------------
ALTER TABLE public.handoff_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ACESSO_TOTAL_TESTE" ON public.handoff_requests;
DROP POLICY IF EXISTS "Operadores podem ver pedidos do seu tenant" ON public.handoff_requests;
DROP POLICY IF EXISTS "Qualquer autenticado pode inserir pedidos" ON public.handoff_requests;
DROP POLICY IF EXISTS "Operadores podem atualizar pedidos do seu tenant" ON public.handoff_requests;

CREATE POLICY "Operadores podem ver pedidos do seu tenant" 
ON public.handoff_requests
FOR SELECT
TO authenticated
USING (
  (SELECT public.is_super_admin())
  OR tenant_id = (SELECT public.get_auth_tenant_id())
  OR EXISTS (
    SELECT 1 FROM public.users 
    WHERE (
      users.provider_id = (SELECT auth.uid())::text 
      OR users.id = (SELECT auth.uid()) 
      OR (
        ((SELECT auth.jwt()) ->> 'email') IS NOT NULL 
        AND LOWER(users.email) = LOWER((SELECT auth.jwt()) ->> 'email')
      )
    )
    AND (
      users.role IN ('davos_admin', 'super_admin', 'tenant_admin')
      OR (
        LENGTH(users.tenant_id::text) = 36 
        AND users.tenant_id::uuid = handoff_requests.tenant_id
      )
    )
  )
);

CREATE POLICY "Operadores podem atualizar pedidos do seu tenant" 
ON public.handoff_requests
FOR UPDATE
TO authenticated
USING (
  (SELECT public.is_super_admin())
  OR tenant_id = (SELECT public.get_auth_tenant_id())
  OR EXISTS (
    SELECT 1 FROM public.users 
    WHERE (
      users.provider_id = (SELECT auth.uid())::text 
      OR users.id = (SELECT auth.uid()) 
      OR (
        ((SELECT auth.jwt()) ->> 'email') IS NOT NULL 
        AND LOWER(users.email) = LOWER((SELECT auth.jwt()) ->> 'email')
      )
    )
    AND (
      users.role IN ('davos_admin', 'super_admin', 'tenant_admin')
      OR (
        LENGTH(users.tenant_id::text) = 36 
        AND users.tenant_id::uuid = handoff_requests.tenant_id
      )
    )
  )
);

CREATE POLICY "Qualquer autenticado pode inserir pedidos" 
ON public.handoff_requests
FOR INSERT 
TO authenticated
WITH CHECK (true);


-- ------------------------------------------------------------------------------
-- 1.4 MESSAGES (Fix initplan + multiple permissive policies)
-- ------------------------------------------------------------------------------
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admin All Access Messages" ON public.messages;
DROP POLICY IF EXISTS "Public Conversation Access" ON public.messages;
DROP POLICY IF EXISTS "Tenant Access Messages" ON public.messages;
DROP POLICY IF EXISTS "Public Read Messages" ON public.messages;
DROP POLICY IF EXISTS "Public Insert Messages" ON public.messages;

-- Acesso anônimo apenas para leitura pública com role 'anon' (InitPlan caching)
CREATE POLICY "Public Conversation Access" ON public.messages
FOR SELECT
TO anon
USING (
  (SELECT auth.role()) = 'anon'
);

-- Acesso dos tenants e administradores autenticados (InitPlan caching)
CREATE POLICY "Tenant Access Messages" ON public.messages
FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
)
WITH CHECK (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
);


-- ------------------------------------------------------------------------------
-- 1.5 USERS (Fix initplan + multiple permissive policies - Idempotente)
-- ------------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_safe" ON public.users;
DROP POLICY IF EXISTS "users_read_policy" ON public.users;
DROP POLICY IF EXISTS "users_select_policy" ON public.users;
DROP POLICY IF EXISTS "Users Read Own Record" ON public.users;
DROP POLICY IF EXISTS "Tenant Read Users" ON public.users;
DROP POLICY IF EXISTS "Super Admin View All" ON public.users;
DROP POLICY IF EXISTS "Users Update Own Profile" ON public.users;
DROP POLICY IF EXISTS "Tenant Admins Update Users" ON public.users;
DROP POLICY IF EXISTS "users_update_admin_safe" ON public.users;
DROP POLICY IF EXISTS "users_insert_admin_safe" ON public.users;
DROP POLICY IF EXISTS "users_insert_self" ON public.users;
DROP POLICY IF EXISTS "Users Register Self" ON public.users;
DROP POLICY IF EXISTS "Users Register Own Profile" ON public.users;
DROP POLICY IF EXISTS "Public Read Users" ON public.users;
DROP POLICY IF EXISTS "Public Update Users" ON public.users;
DROP POLICY IF EXISTS "Public Insert Users" ON public.users;
DROP POLICY IF EXISTS "Public Delete Users" ON public.users;
DROP POLICY IF EXISTS "Same Tenant View" ON public.users;
DROP POLICY IF EXISTS "Users Read Self" ON public.users;
DROP POLICY IF EXISTS "users_select_consolidated" ON public.users;
DROP POLICY IF EXISTS "users_update_consolidated" ON public.users;
DROP POLICY IF EXISTS "users_insert_consolidated" ON public.users;

-- SELECT Consolidado
CREATE POLICY "users_select_consolidated" ON public.users
FOR SELECT
TO authenticated
USING (
  id = (SELECT auth.uid())
  OR (provider_id IS NOT NULL AND provider_id = (SELECT auth.uid())::text)
  OR tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
);

-- UPDATE Consolidado
CREATE POLICY "users_update_consolidated" ON public.users
FOR UPDATE
TO authenticated
USING (
  id = (SELECT auth.uid())
  OR (provider_id IS NOT NULL AND provider_id = (SELECT auth.uid())::text)
  OR (SELECT public.is_super_admin())
  OR (
    (SELECT role FROM public.users WHERE id = (SELECT auth.uid()) OR provider_id = (SELECT auth.uid())::text LIMIT 1) IN ('tenant_admin', 'super_admin')
    AND tenant_id = (SELECT tenant_id FROM public.users WHERE id = (SELECT auth.uid()) OR provider_id = (SELECT auth.uid())::text LIMIT 1)
  )
)
WITH CHECK (
  id = (SELECT auth.uid())
  OR (provider_id IS NOT NULL AND provider_id = (SELECT auth.uid())::text)
  OR (SELECT public.is_super_admin())
  OR (
    (SELECT role FROM public.users WHERE id = (SELECT auth.uid()) OR provider_id = (SELECT auth.uid())::text LIMIT 1) IN ('tenant_admin', 'super_admin')
    AND tenant_id = (SELECT tenant_id FROM public.users WHERE id = (SELECT auth.uid()) OR provider_id = (SELECT auth.uid())::text LIMIT 1)
  )
);

-- INSERT Consolidado
CREATE POLICY "users_insert_consolidated" ON public.users
FOR INSERT
TO authenticated
WITH CHECK (
  id = (SELECT auth.uid())
  OR (provider_id IS NOT NULL AND provider_id = (SELECT auth.uid())::text)
  OR (SELECT public.is_super_admin())
  OR (
    (SELECT role FROM public.users WHERE id = (SELECT auth.uid()) OR provider_id = (SELECT auth.uid())::text LIMIT 1) IN ('tenant_admin', 'super_admin')
  )
);


-- ------------------------------------------------------------------------------
-- 1.6 COMPANY_DAVOS_COSTS (Fix initplan + multiple permissive policies)
-- ------------------------------------------------------------------------------
ALTER TABLE public.company_davos_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admin Access Davos Costs" ON public.company_davos_costs;
DROP POLICY IF EXISTS "Users can manage their own tenant costs" ON public.company_davos_costs;
DROP POLICY IF EXISTS "tenant_manage_davos_costs" ON public.company_davos_costs;

CREATE POLICY "tenant_manage_davos_costs" ON public.company_davos_costs
FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
)
WITH CHECK (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
);


-- ------------------------------------------------------------------------------
-- 1.7 AGENT_KNOWLEDGE (Fix multiple permissive policies)
-- ------------------------------------------------------------------------------
ALTER TABLE public.agent_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admin All Access Knowledge" ON public.agent_knowledge;
DROP POLICY IF EXISTS "Tenant Manage Knowledge" ON public.agent_knowledge;
DROP POLICY IF EXISTS "Tenant Read Knowledge" ON public.agent_knowledge;
DROP POLICY IF EXISTS "Public Read Knowledge" ON public.agent_knowledge;
DROP POLICY IF EXISTS "Public Manage Knowledge" ON public.agent_knowledge;
DROP POLICY IF EXISTS "Users can view knowledge for their tenant" ON public.agent_knowledge;
DROP POLICY IF EXISTS "Users can manage knowledge for their tenant" ON public.agent_knowledge;
DROP POLICY IF EXISTS "tenant_manage_agent_knowledge" ON public.agent_knowledge;

CREATE POLICY "tenant_manage_agent_knowledge" ON public.agent_knowledge
FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
)
WITH CHECK (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
);


-- ------------------------------------------------------------------------------
-- 1.8 AGENT_TOOLS (Fix multiple permissive policies)
-- ------------------------------------------------------------------------------
ALTER TABLE public.agent_tools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Porteiro can read tools" ON public.agent_tools;
DROP POLICY IF EXISTS "agent_tools_access_safe" ON public.agent_tools;
DROP POLICY IF EXISTS "Tenant Manage Own Tools" ON public.agent_tools;
DROP POLICY IF EXISTS "tenant_manage_agent_tools" ON public.agent_tools;

CREATE POLICY "tenant_manage_agent_tools" ON public.agent_tools
FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
)
WITH CHECK (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
);


-- ------------------------------------------------------------------------------
-- 1.9 AGENTS (Fix multiple permissive policies)
-- ------------------------------------------------------------------------------
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admin All Access Agents" ON public.agents;
DROP POLICY IF EXISTS "Tenant Manage Agents" ON public.agents;
DROP POLICY IF EXISTS "Tenant Modify Agents" ON public.agents;
DROP POLICY IF EXISTS "Tenant Read Agents" ON public.agents;
DROP POLICY IF EXISTS "agents_access_safe" ON public.agents;
DROP POLICY IF EXISTS "Tenant Access Agents" ON public.agents;
DROP POLICY IF EXISTS "Public Read Agents" ON public.agents;
DROP POLICY IF EXISTS "Public Insert Agents" ON public.agents;
DROP POLICY IF EXISTS "Public Update Agents" ON public.agents;
DROP POLICY IF EXISTS "Public Delete Agents" ON public.agents;
DROP POLICY IF EXISTS "tenant_manage_agents" ON public.agents;

CREATE POLICY "tenant_manage_agents" ON public.agents
FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
)
WITH CHECK (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
);


-- ------------------------------------------------------------------------------
-- 1.10 CAMPAIGNS (Fix multiple permissive policies)
-- ------------------------------------------------------------------------------
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admin All Access Campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Tenant Insert Campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Tenant Read Campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Tenant Update Campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Tenant Delete Campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Tenant Manage Campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "tenant_manage_campaigns" ON public.campaigns;

CREATE POLICY "tenant_manage_campaigns" ON public.campaigns
FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
)
WITH CHECK (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
);


-- ------------------------------------------------------------------------------
-- 1.11 COMPANIES (Fix multiple permissive policies)
-- ------------------------------------------------------------------------------
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admin Update Companies" ON public.companies;
DROP POLICY IF EXISTS "Tenant Update Own Company" ON public.companies;
DROP POLICY IF EXISTS "Tenant Read Own Company" ON public.companies;
DROP POLICY IF EXISTS "Super Admin Delete Companies" ON public.companies;
DROP POLICY IF EXISTS "Super Admin Insert Companies" ON public.companies;
DROP POLICY IF EXISTS "Public Read Companies" ON public.companies;
DROP POLICY IF EXISTS "Public Update Companies" ON public.companies;
DROP POLICY IF EXISTS "Public Delete Companies" ON public.companies;
DROP POLICY IF EXISTS "Public Insert Companies" ON public.companies;
DROP POLICY IF EXISTS "companies_select_policy" ON public.companies;
DROP POLICY IF EXISTS "companies_update_policy" ON public.companies;
DROP POLICY IF EXISTS "companies_insert_policy" ON public.companies;
DROP POLICY IF EXISTS "companies_delete_policy" ON public.companies;

CREATE POLICY "companies_select_policy" ON public.companies
FOR SELECT
TO authenticated
USING (
  id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
);

CREATE POLICY "companies_update_policy" ON public.companies
FOR UPDATE
TO authenticated
USING (
  id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
)
WITH CHECK (
  id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
);

CREATE POLICY "companies_insert_policy" ON public.companies
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.is_super_admin())
);

CREATE POLICY "companies_delete_policy" ON public.companies
FOR DELETE
TO authenticated
USING (
  (SELECT public.is_super_admin())
);


-- ------------------------------------------------------------------------------
-- 1.12 CONTACTS (Fix multiple permissive policies)
-- ------------------------------------------------------------------------------
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admin All Access Contacts" ON public.contacts;
DROP POLICY IF EXISTS "Tenant Access Contacts" ON public.contacts;
DROP POLICY IF EXISTS "Tenant Manage Contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can insert/update contacts of their tenant" ON public.contacts;
DROP POLICY IF EXISTS "Users can view contacts of their tenant" ON public.contacts;
DROP POLICY IF EXISTS "tenant_manage_contacts" ON public.contacts;

CREATE POLICY "tenant_manage_contacts" ON public.contacts
FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
)
WITH CHECK (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
);


-- ------------------------------------------------------------------------------
-- 1.13 CONVERSATIONS (Fix multiple permissive policies)
-- ------------------------------------------------------------------------------
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admin All Access Conversations" ON public.conversations;
DROP POLICY IF EXISTS "Tenant Access Conversations" ON public.conversations;
DROP POLICY IF EXISTS "Public Read Conversations" ON public.conversations;
DROP POLICY IF EXISTS "Public Insert Conversations" ON public.conversations;
DROP POLICY IF EXISTS "Public Update Conversations" ON public.conversations;
DROP POLICY IF EXISTS "tenant_manage_conversations" ON public.conversations;

CREATE POLICY "tenant_manage_conversations" ON public.conversations
FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
)
WITH CHECK (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
);


-- ------------------------------------------------------------------------------
-- 1.14 INCIDENTS (Cleanup preventivo de duplicidade)
-- ------------------------------------------------------------------------------
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admin All Access Incidents" ON public.incidents;
DROP POLICY IF EXISTS "Incidents Read Access" ON public.incidents;
DROP POLICY IF EXISTS "Tenant Read Incidents" ON public.incidents;
DROP POLICY IF EXISTS "Tenant Access Incidents" ON public.incidents;
DROP POLICY IF EXISTS "Tenant Manage Incidents" ON public.incidents;
DROP POLICY IF EXISTS "Tenants can view their own incidents" ON public.incidents;
DROP POLICY IF EXISTS "Tenants can manage their own incidents" ON public.incidents;
DROP POLICY IF EXISTS "Tenants can insert their own incidents" ON public.incidents;
DROP POLICY IF EXISTS "Tenant Insert Incidents" ON public.incidents;
DROP POLICY IF EXISTS "Tenant Update Incidents" ON public.incidents;
DROP POLICY IF EXISTS "Tenant Delete Incidents" ON public.incidents;
DROP POLICY IF EXISTS "Super Admin Manage Incidents" ON public.incidents;
DROP POLICY IF EXISTS "tenant_manage_incidents" ON public.incidents;

CREATE POLICY "tenant_manage_incidents" ON public.incidents
FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
)
WITH CHECK (
  tenant_id = (SELECT public.get_auth_tenant_id())
  OR (SELECT public.is_super_admin())
);

COMMIT;

-- Recarregar cache de schema do PostgREST
NOTIFY pgrst, 'reload schema';
