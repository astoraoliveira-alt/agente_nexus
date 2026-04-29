-- ==============================================================================
-- FIX: Campaigns RLS Policy (with Super Admin Support)
-- ==============================================================================

BEGIN;

-- 1. Drop the problematic recursive policies
DROP POLICY IF EXISTS "Tenant Access Campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Public campaigns are viewable by everyone" ON public.campaigns;
DROP POLICY IF EXISTS "Tenant Read Campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Tenant Insert Campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Tenant Update Campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Tenant Delete Campaigns" ON public.campaigns;

-- 2. Ensure get_auth_tenant_id() is safe to use
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- We link the authenticated user via provider_id to the users table
  RETURN (
    SELECT tenant_id 
    FROM public.users 
    WHERE provider_id = auth.uid()::text 
    LIMIT 1
  );
END;
$$;

-- 3. Ensure is_super_admin() is available
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
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

-- 4. Create non-recursive policies relying on the helper OR the super_admin check
-- Reading campaigns
CREATE POLICY "Tenant Read Campaigns" ON public.campaigns
FOR SELECT
USING ( tenant_id = public.get_auth_tenant_id() OR public.is_super_admin() );

-- Inserting campaigns
CREATE POLICY "Tenant Insert Campaigns" ON public.campaigns
FOR INSERT
WITH CHECK ( tenant_id = public.get_auth_tenant_id() OR public.is_super_admin() );

-- Updating campaigns
CREATE POLICY "Tenant Update Campaigns" ON public.campaigns
FOR UPDATE
USING ( tenant_id = public.get_auth_tenant_id() OR public.is_super_admin() );

-- Deleting campaigns
CREATE POLICY "Tenant Delete Campaigns" ON public.campaigns
FOR DELETE
USING ( tenant_id = public.get_auth_tenant_id() OR public.is_super_admin() );


-- ==============================================================================
-- Let's also ensure INCIDENTS are visible to super admins
-- ==============================================================================
DROP POLICY IF EXISTS "Tenant Read Incidents" ON public.incidents;
DROP POLICY IF EXISTS "Tenant Access Incidents" ON public.incidents;

CREATE POLICY "Tenant Read Incidents" ON public.incidents
FOR SELECT
USING ( tenant_id = public.get_auth_tenant_id() OR public.is_super_admin() );

CREATE POLICY "Tenant Update Incidents" ON public.incidents
FOR UPDATE
USING ( tenant_id = public.get_auth_tenant_id() OR public.is_super_admin() );

CREATE POLICY "Tenant Insert Incidents" ON public.incidents
FOR INSERT
WITH CHECK ( tenant_id = public.get_auth_tenant_id() OR public.is_super_admin() );

CREATE POLICY "Tenant Delete Incidents" ON public.incidents
FOR DELETE
USING ( tenant_id = public.get_auth_tenant_id() OR public.is_super_admin() );

COMMIT;
