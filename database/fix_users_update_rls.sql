-- =============================================
-- FIX USERS RLS UPDATE POLICY
-- Issue: PGRST116 during user profile update (0 rows affected)
-- Cause: Users table lacked an UPDATE policy for self-edits
-- =============================================

-- Allow users to update their own profile
DROP POLICY IF EXISTS "Users Update Own Profile" ON public.users;

CREATE POLICY "Users Update Own Profile" 
ON public.users 
FOR UPDATE 
USING (
  provider_id = auth.uid()::text
)
WITH CHECK (
  provider_id = auth.uid()::text
);

-- Allow Tenant Admins to update users in their tenant
DROP POLICY IF EXISTS "Tenant Admins Update Users" ON public.users;

CREATE POLICY "Tenant Admins Update Users" 
ON public.users 
FOR UPDATE 
USING (
  (SELECT role FROM public.users WHERE provider_id = auth.uid()::text LIMIT 1) IN ('tenant_admin', 'super_admin')
  AND 
  tenant_id = (SELECT tenant_id FROM public.users WHERE provider_id = auth.uid()::text LIMIT 1)
);
