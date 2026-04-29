-- =============================================
-- FIX RLS RECURSION V4
-- Resolves 403 Forbidden by breaking infinite loops in 'users' and 'policies'
-- =============================================

-- 1. Helper functions (Security Definer to bypass RLS recursion)
CREATE OR REPLACE FUNCTION public.get_current_user_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- 2. FIX USERS TABLE RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Read Users" ON public.users;
DROP POLICY IF EXISTS "Users Register Self" ON public.users;

-- Admin can see all, users can see own tenant
CREATE POLICY "users_read_policy" ON public.users
FOR SELECT
TO authenticated
USING (
    id = auth.uid() 
    OR 
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()) -- This still recurses!
);

-- RE-FIXING WITH JWT OR FUNCTION
DROP POLICY IF EXISTS "users_read_policy" ON public.users;

CREATE POLICY "users_select_policy" ON public.users
FOR SELECT
TO authenticated
USING (
    id = auth.uid() 
    OR 
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    OR
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin' -- Recursion!
);

-- LET'S USE THE SECURITY DEFINER FUNCTIONS FOR EVERYTHING
DROP POLICY IF EXISTS "users_select_policy" ON public.users;

CREATE POLICY "users_read_safe" ON public.users
FOR SELECT
TO authenticated
USING (
    id = auth.uid() 
    OR 
    tenant_id = public.get_current_user_tenant_id()
    OR 
    public.get_current_user_role() = 'super_admin'
);

CREATE POLICY "users_insert_self" ON public.users
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- 3. FIX POLICIES TABLE RLS
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "policies_all_access" ON public.policies;
DROP POLICY IF EXISTS "Tenant Manage Policies" ON public.policies;

CREATE POLICY "policies_main_access" ON public.policies
FOR ALL
TO authenticated
USING (
    tenant_id = public.get_current_user_tenant_id()
    OR 
    public.get_current_user_role() = 'super_admin'
)
WITH CHECK (
    tenant_id = public.get_current_user_tenant_id()
    OR 
    public.get_current_user_role() = 'super_admin'
);

-- 4. FIX AGENTS TABLE RLS (Just in case)
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Access Agents" ON public.agents;

CREATE POLICY "agents_access_safe" ON public.agents
FOR ALL
TO authenticated
USING (
    tenant_id = public.get_current_user_tenant_id()
    OR 
    public.get_current_user_role() = 'super_admin'
)
WITH CHECK (
    tenant_id = public.get_current_user_tenant_id()
    OR 
    public.get_current_user_role() = 'super_admin'
);
