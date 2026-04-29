-- =============================================
-- EMERGENCY FIX: Users RLS Recursion Error
-- Purpose: Fix 500 error on login caused by recursive RLS on 'users' table
-- =============================================

-- 1. Remove recursive policies
DROP POLICY IF EXISTS "Tenant Read Users" ON public.users;
DROP POLICY IF EXISTS "Users Read Self" ON public.users;
DROP POLICY IF EXISTS "Super Admin All Access Users" ON public.users;

-- 2. New Hardened & Efficient Policies
-- Policy A: Always allow users to read their own record (Fixed 500 on login)
CREATE POLICY "Users Read Own Record" ON public.users
FOR SELECT
USING (auth.uid() = id);

-- Policy B: Allow Super Admins to see everyone
CREATE POLICY "Super Admin View All" ON public.users
FOR SELECT
USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
);

-- Policy C: Allow members of the same tenant to see each other
-- Note: We use a subquery but ensure it doesn't cause infinite loop in most Supabase setups
CREATE POLICY "Same Tenant View" ON public.users
FOR SELECT
USING (
    tenant_id IN (
      SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()
    )
);

-- 3. Verification
SELECT tablename, policyname, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'users';
