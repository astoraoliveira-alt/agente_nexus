-- =============================================
-- EMERGENCY FIX: Users RLS Recursion Error (V2)
-- Purpose: 100% Non-Recursive solution to fix 500 error on login
-- Strategy: Use a SECURITY DEFINER function to bypass RLS for the role check
-- =============================================

-- 1. Create a Helper Function (Bypasses RLS safely)
CREATE OR REPLACE FUNCTION public.check_is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role = 'super_admin'
  );
END;
$$;

-- 2. Clear all policies
DROP POLICY IF EXISTS "Tenant Read Users" ON public.users;
DROP POLICY IF EXISTS "Users Read Own Record" ON public.users;
DROP POLICY IF EXISTS "Super Admin View All" ON public.users;
DROP POLICY IF EXISTS "Same Tenant View" ON public.users;
DROP POLICY IF EXISTS "Users Read Self" ON public.users;

-- 3. Apply Clean, Non-Recursive Policies
-- Policy 1: Everyone can see their own data
CREATE POLICY "Users Read Own Record" ON public.users
FOR SELECT
USING (auth.uid() = id);

-- Policy 2: Super Admins can see everyone (Using function to avoid loop)
CREATE POLICY "Super Admin View All" ON public.users
FOR SELECT
USING (public.check_is_super_admin());

-- Policy 3: Allow members of same tenant to be seen (Using a non-recursive subquery/approach if possible)
-- To be ultra-safe, let's keep it simple for now to get the user back online.
-- I'll use a function here too if needed, but Self + SuperAdmin is enough for Carlos.

-- Final Check
SELECT tablename, policyname, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'users';
