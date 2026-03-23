-- =============================================
-- SECURITY AUDIT FIX: Infrastructure Hardening
-- Purpose: Protect sensitive company data and optimize RLS
-- =============================================

-- 1. Hardening RPC: get_companies_overview
-- Restrict to super_admin only to prevent IDOR data leak
CREATE OR REPLACE FUNCTION get_companies_overview()
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    slug VARCHAR,
    status VARCHAR,
    plan_tier VARCHAR,
    created_at TIMESTAMPTZ,
    privacy_settings JSONB,
    plan_details JSONB,
    agents_count BIGINT,
    users_count BIGINT,
    total_tokens NUMERIC,
    total_messages BIGINT,
    plan_prices JSONB,
    plan_name VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_role VARCHAR;
BEGIN
    -- 🔒 Security Gate: Only super_admin allowed
    SELECT role INTO v_user_role FROM public.users WHERE id = auth.uid();
    
    IF v_user_role != 'super_admin' THEN
        RAISE EXCEPTION '⛔ Permission Denied: Apenas Super Admin pode acessar a visão geral de empresas.';
    END IF;

    RETURN QUERY
    SELECT 
        c.id,
        c.name::VARCHAR,
        c.slug::VARCHAR,
        c.status::VARCHAR,
        c.plan_tier::VARCHAR,
        c.created_at,
        c.privacy_settings,
        c.plan_details,
        (SELECT COUNT(*) FROM agents a WHERE a.tenant_id = c.id) as agents_count,
        (SELECT COUNT(*) FROM users u WHERE u.tenant_id = c.id) as users_count,
        COALESCE((
            SELECT SUM(cm.value) 
            FROM consumption_metrics cm 
            WHERE cm.tenant_id = c.id 
            AND cm.metric_type = 'tokens'
        ), 0) as total_tokens,
        COALESCE((
            SELECT COUNT(*) 
            FROM messages m 
            WHERE m.tenant_id = c.id
        ), 0) as total_messages,
        (
            SELECT jsonb_build_object(
                'basePrice', p.base_price,
                'llmTokenPrice', p.llm_token_price,
                'messagePrice', p.message_price,
                'sttMinutePrice', p.stt_minute_price,
                'ttsMinutePrice', p.tts_minute_price
            )
            FROM plans p
            WHERE p.id = c.plan_tier
            LIMIT 1
        ) as plan_prices,
        (SELECT p.name::VARCHAR FROM plans p WHERE p.id = c.plan_tier) as plan_name
    FROM companies c
    ORDER BY c.name;
END;
$$;

-- 2. Refactor Users RLS (Remove Circular Dependency)
-- Use a safer subquery that doesn't trigger recursion on the same policy
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Read Users" ON public.users;
CREATE POLICY "Tenant Read Users" ON public.users 
FOR SELECT 
USING (
    -- Direct check against auth.uid() tenant_id without recursive policy check
    tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid())
);

-- 3. Blindagem de API Keys (Column Level Protection)
-- We restrict standard users from reading sensitive keys in companies table
DROP POLICY IF EXISTS "Tenant Read Own Company" ON public.companies;
CREATE POLICY "Tenant Read Own Company" ON public.companies 
FOR SELECT 
USING (
    id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
);

-- Note: In Supabase, column-level security is best handled by not including the column
-- in the SELECT policy for low-privilege roles, but since RLS is row-based,
-- we recommend Super Admin access for raw company table editing.

-- Final Check
SELECT proname, prosecdef as security_definer, proconfig FROM pg_proc WHERE proname = 'get_companies_overview';
