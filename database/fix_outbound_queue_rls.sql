-- ==============================================================================
-- FIX: Outbound Queue RLS Policy (with Super Admin Support)
-- ==============================================================================

BEGIN;

-- 1. Drop the problematic recursive policies for outbound_queue
DROP POLICY IF EXISTS "Tenant Access Outbound Queue" ON public.outbound_queue;
DROP POLICY IF EXISTS "Tenant Read Outbound Queue" ON public.outbound_queue;
DROP POLICY IF EXISTS "Tenant Insert Outbound Queue" ON public.outbound_queue;
DROP POLICY IF EXISTS "Tenant Update Outbound Queue" ON public.outbound_queue;
DROP POLICY IF EXISTS "Tenant Delete Outbound Queue" ON public.outbound_queue;

-- 2. Ensure we have the same safe Non-recursive policies as campaigns, allowing the super admin bypass

-- Reading queue
CREATE POLICY "Tenant Read Outbound Queue" ON public.outbound_queue
FOR SELECT
USING ( tenant_id = public.get_auth_tenant_id() OR public.is_super_admin() );

-- Inserting into queue
CREATE POLICY "Tenant Insert Outbound Queue" ON public.outbound_queue
FOR INSERT
WITH CHECK ( tenant_id = public.get_auth_tenant_id() OR public.is_super_admin() );

-- Updating queue
CREATE POLICY "Tenant Update Outbound Queue" ON public.outbound_queue
FOR UPDATE
USING ( tenant_id = public.get_auth_tenant_id() OR public.is_super_admin() );

-- Deleting from queue
CREATE POLICY "Tenant Delete Outbound Queue" ON public.outbound_queue
FOR DELETE
USING ( tenant_id = public.get_auth_tenant_id() OR public.is_super_admin() );

COMMIT;
