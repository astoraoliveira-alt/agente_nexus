-- Fix RLS for policies table to allow creation by tenants
-- This script ensures that tenants can INSERT, SELECT, UPDATE, and DELETE their own policies.

-- 1. Enable RLS
ALTER TABLE IF EXISTS public.policies ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing restrictive policies if any
DROP POLICY IF EXISTS "Tenant Access Policies" ON public.policies;
DROP POLICY IF EXISTS "Tenant Manage Policies" ON public.policies;

-- 3. Create a comprehensive policy for Tenants
-- This policy uses auth.uid() to find the user's tenant_id and allows access to policies with the same tenant_id.
CREATE POLICY "Tenant Manage Policies" ON public.policies
FOR ALL
TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- 4. Grant access to authenticated users
GRANT ALL ON public.policies TO authenticated;
GRANT ALL ON public.policies TO service_role;

-- 5. Force schema cache reload (dummy comment for Supabase)
-- RELOAD SCHEMA CACHE;
