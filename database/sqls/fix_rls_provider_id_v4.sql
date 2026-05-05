-- =============================================
-- FIX RLS PROVIDER_ID FALLBACK
-- Description: Fixes get_auth_tenant_id and is_super_admin to check both id and provider_id
-- =============================================

CREATE OR REPLACE FUNCTION get_auth_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id TEXT;
    v_claims JSONB;
BEGIN
    -- Get claims once
    v_claims := current_setting('request.jwt.claims', true)::jsonb;
    
    -- 1. Try metadata (Eliminates SELECT)
    v_tenant_id := v_claims -> 'app_metadata' ->> 'tenant_id';
    IF v_tenant_id IS NULL THEN
        v_tenant_id := v_claims -> 'user_metadata' ->> 'tenant_id';
    END IF;

    -- 2. Fallback to Session Variable (Fast lookup)
    IF v_tenant_id IS NULL THEN
        v_tenant_id := current_setting('davos.current_tenant_id', true);
    END IF;

    -- 3. Last Fallback (SELECT once per transaction)
    -- This query is SECURITY DEFINER, so it bypasses RLS on users.
    IF v_tenant_id IS NULL OR v_tenant_id = '' THEN
        SELECT tenant_id::TEXT INTO v_tenant_id
        FROM public.users
        WHERE id = auth.uid() OR provider_id = auth.uid()::text
        LIMIT 1;
        
        -- Cache in session variable for subsequent rows in this transaction
        IF v_tenant_id IS NOT NULL THEN
            PERFORM set_config('davos.current_tenant_id', v_tenant_id, true);
        END IF;
    END IF;

    RETURN v_tenant_id::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_role TEXT;
BEGIN
    -- 1. Check JWT claims (metadata or identity)
    v_role := current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role';
    
    IF v_role = 'super_admin' THEN
        RETURN TRUE;
    END IF;

    -- 2. Fallback to Session Variable
    v_role := current_setting('davos.current_role', true);
    IF v_role = 'super_admin' THEN
        RETURN TRUE;
    END IF;

    -- 3. Last Fallback: Query DB once per transaction
    IF v_role IS NULL OR v_role = '' THEN
        SELECT role INTO v_role
        FROM public.users
        WHERE id = auth.uid() OR provider_id = auth.uid()::text
        LIMIT 1;
        
        PERFORM set_config('davos.current_role', v_role, true);
        
        IF v_role = 'super_admin' THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN FALSE;
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$;
