-- ==============================================================================
-- FIX: Campaigns RLS Policy
-- ==============================================================================

BEGIN;

-- 1. Drop the problematic recursive policies
DROP POLICY IF EXISTS "Tenant Access Campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Public campaigns are viewable by everyone" ON public.campaigns;

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

-- 3. Create non-recursive policies relying on the helper
-- Reading campaigns
CREATE POLICY "Tenant Read Campaigns" ON public.campaigns
FOR SELECT
USING ( tenant_id = public.get_auth_tenant_id() );

-- Inserting campaigns
CREATE POLICY "Tenant Insert Campaigns" ON public.campaigns
FOR INSERT
WITH CHECK ( tenant_id = public.get_auth_tenant_id() );

-- Updating campaigns
CREATE POLICY "Tenant Update Campaigns" ON public.campaigns
FOR UPDATE
USING ( tenant_id = public.get_auth_tenant_id() );

-- Deleting campaigns
CREATE POLICY "Tenant Delete Campaigns" ON public.campaigns
FOR DELETE
USING ( tenant_id = public.get_auth_tenant_id() );

COMMIT;
