-- ==============================================================================
-- MIGRATION: 20260928_fix_user_and_tenant_rls_provider_id.sql
-- Descrição:
--   Corrige as funções auxiliares de contexto de usuário e políticas RLS
--   para suportar usuários cujo auth.uid() está armazenado no campo 'provider_id'
--   (e não no campo 'id', que utiliza UUID próprio gerado no convite).
--   Sem esse ajuste, operadores e administradores de tenant não conseguiam ler
--   seu próprio registro em 'public.users' ou a empresa em 'public.companies'.
-- ==============================================================================

-- 1. Atualizar get_auth_tenant() para checar tanto id quanto provider_id
CREATE OR REPLACE FUNCTION public.get_auth_tenant()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN (
    SELECT tenant_id 
    FROM public.users 
    WHERE id = auth.uid() OR provider_id = auth.uid()::text 
    LIMIT 1
  );
END;
$$;

-- 2. Atualizar get_current_user_tenant_id()
CREATE OR REPLACE FUNCTION public.get_current_user_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN (
    SELECT tenant_id 
    FROM public.users 
    WHERE id = auth.uid() OR provider_id = auth.uid()::text 
    LIMIT 1
  );
END;
$$;

-- 3. Atualizar get_current_user_role()
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN (
    SELECT role 
    FROM public.users 
    WHERE id = auth.uid() OR provider_id = auth.uid()::text 
    LIMIT 1
  );
END;
$$;

-- 4. Atualizar políticas RLS da tabela 'users' para permitir leitura do próprio perfil
DROP POLICY IF EXISTS "Users Read Own Record" ON public.users;
CREATE POLICY "Users Read Own Record" ON public.users
FOR SELECT
USING (
  auth.uid() = id 
  OR (provider_id IS NOT NULL AND provider_id = auth.uid()::text)
);

DROP POLICY IF EXISTS "Tenant Read Users" ON public.users;
CREATE POLICY "Tenant Read Users" ON public.users
FOR SELECT
USING (
  tenant_id = get_auth_tenant_id()
  OR tenant_id = get_auth_tenant()
  OR is_super_admin()
  OR id = auth.uid()
  OR (provider_id IS NOT NULL AND provider_id = auth.uid()::text)
);

-- 5. Atualizar política RLS da tabela 'companies' para leitura do tenant do usuário
DROP POLICY IF EXISTS "Tenant Read Own Company" ON public.companies;
CREATE POLICY "Tenant Read Own Company" ON public.companies
FOR SELECT
USING (
  id = get_auth_tenant_id()
  OR id = get_auth_tenant()
  OR is_super_admin()
);

-- Notificar PostgREST para recarregar o schema cache
NOTIFY pgrst, 'reload schema';
