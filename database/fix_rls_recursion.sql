-- =============================================
-- FIX: RLS RECURSION ERROR
-- Purpose: Convert helper functions to SECURITY DEFINER to avoid infinite recursion
-- when the users table policy calls a function that selects from the users table.
-- =============================================

-- 1. Helper: Get Current Tenant ID (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER -- CRITICAL FIX
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN (SELECT tenant_id FROM public.users WHERE provider_id = auth.uid()::text LIMIT 1);
END;
$$;

-- 2. Helper: Check if Super Admin (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- CRITICAL FIX
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE provider_id = auth.uid()::text 
    AND role = 'super_admin'
  );
END;
$$;

-- 3. Update Policies to be more robust
-- We ensure that these helpers are used correctly without triggering new recursions.

DROP POLICY IF EXISTS "Tenant Read Users" ON users;
CREATE POLICY "Tenant Read Users" ON users
FOR SELECT
USING (
  (provider_id = auth.uid()::text) -- User can always see their own profile
  OR 
  (tenant_id = get_current_tenant_id()) -- User sees colleagues
  OR 
  is_super_admin() -- Admin sees everything
);
