-- Robust RLS Fix for Policies Table (v2)
-- This version separates permissions and adds a bypass for Super Admins.

-- 1. Ensure RLS is enabled
ALTER TABLE IF EXISTS public.policies ENABLE ROW LEVEL SECURITY;

-- 2. Drop all previous policies to avoid conflicts
DROP POLICY IF EXISTS "Tenant Access Policies" ON public.policies;
DROP POLICY IF EXISTS "Tenant Manage Policies" ON public.policies;
DROP POLICY IF EXISTS "Super Admin Policies" ON public.policies;

-- 3. Policy for SELECT (all authenticated users can see their own tenant policies)
CREATE POLICY "policies_select_policy" ON public.policies
FOR SELECT
TO authenticated
USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    OR 
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

-- 4. Policy for INSERT (must match tenant_id or be super_admin)
CREATE POLICY "policies_insert_policy" ON public.policies
FOR INSERT
TO authenticated
WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    OR 
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

-- 5. Policy for UPDATE
CREATE POLICY "policies_update_policy" ON public.policies
FOR UPDATE
TO authenticated
USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    OR 
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
)
WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    OR 
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

-- 6. Policy for DELETE
CREATE POLICY "policies_delete_policy" ON public.policies
FOR DELETE
TO authenticated
USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    OR 
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

-- 7. Permissions
GRANT ALL ON public.policies TO authenticated;
GRANT ALL ON public.policies TO service_role;
GRANT ALL ON public.policies TO anon; -- Allow anon if needed, but RLS will still block based on auth.uid()

-- 8. Fix for 'users' table recursion if needed (often a source of 403)
-- (But we assume users table RLS is already correct for now)

-- 9. Reload cache
COMMENT ON TABLE public.policies IS 'Policies table with RLS v2';
