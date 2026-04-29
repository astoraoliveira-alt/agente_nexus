-- Final RLS Fix for Policies Table (v3)
-- This version uses a Security Definer function to avoid recursion and improve performance.

-- 1. Security Definer function to get current user's tenant_id safely
CREATE OR REPLACE FUNCTION public.get_current_user_tenant()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid();
$$;

-- 2. Security Definer function to check if current user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role = 'super_admin' FROM public.users WHERE id = auth.uid();
$$;

-- 3. Enable RLS and clean up
ALTER TABLE IF EXISTS public.policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "policies_select_policy" ON public.policies;
DROP POLICY IF EXISTS "policies_insert_policy" ON public.policies;
DROP POLICY IF EXISTS "policies_update_policy" ON public.policies;
DROP POLICY IF EXISTS "policies_delete_policy" ON public.policies;
DROP POLICY IF EXISTS "Tenant Access Policies" ON public.policies;
DROP POLICY IF EXISTS "Tenant Manage Policies" ON public.policies;
DROP POLICY IF EXISTS "Super Admin Policies" ON public.policies;

-- 4. Unified Policy using functions
CREATE POLICY "policies_all_access" ON public.policies
FOR ALL
TO authenticated
USING (
    tenant_id = public.get_current_user_tenant()
    OR 
    public.is_super_admin()
)
WITH CHECK (
    tenant_id = public.get_current_user_tenant()
    OR 
    public.is_super_admin()
);

-- 5. Permissions
GRANT EXECUTE ON FUNCTION public.get_current_user_tenant() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT ALL ON public.policies TO authenticated;
GRANT ALL ON public.policies TO service_role;

-- 6. Reload cache hint
COMMENT ON TABLE public.policies IS 'Policies table with RLS v3 (Function Based)';
