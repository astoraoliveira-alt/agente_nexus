-- =============================================
-- FIX MESSAGES RLS
-- Description: Ensures the messages table has the correct RLS policy using the fallback function
-- =============================================

-- Ensure RLS is enabled
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Drop all possible old policies on messages to avoid conflicts
DROP POLICY IF EXISTS "Tenant Access Messages" ON public.messages;
DROP POLICY IF EXISTS "Public Read Messages" ON public.messages;
DROP POLICY IF EXISTS "Public Insert Messages" ON public.messages;
DROP POLICY IF EXISTS "Public Update Messages" ON public.messages;
DROP POLICY IF EXISTS "Public Delete Messages" ON public.messages;
DROP POLICY IF EXISTS "Tenant Access" ON public.messages;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.messages;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.messages;

-- Create the single, highly-performant policy for ALL operations
CREATE POLICY "Tenant Access Messages" ON public.messages 
FOR ALL USING (
    (tenant_id = get_auth_tenant_id()) OR (is_super_admin())
);

-- Force analyze to update statistics
ANALYZE public.messages;
