-- =============================================
-- PERFORMANCE OPTIMIZATION FINAL (V3)
-- Description: Zero-Query RLS using JWT Metadata.
-- =============================================

-- 1. Optimized Helper: get_auth_tenant_id
-- Prioritizes JWT app_metadata -> user_metadata -> session variable.
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
        WHERE id = auth.uid();
        
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

-- 2. Optimized Helper: is_super_admin (Zero Query)
-- Relies on JWT metadata if possible.
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
        WHERE id = auth.uid();
        
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

-- 3. Re-Apply policies for hotspots
-- USERS
DROP POLICY IF EXISTS "Tenant Read Users" ON users;
CREATE POLICY "Tenant Read Users" ON users 
FOR SELECT USING (
    (tenant_id = get_auth_tenant_id()) OR (is_super_admin())
);

-- AGENTS
DROP POLICY IF EXISTS "Tenant Manage Agents" ON agents;
CREATE POLICY "Tenant Manage Agents" ON agents 
FOR ALL USING (
    (tenant_id = get_auth_tenant_id()) OR (is_super_admin())
);

-- MESSAGES
DROP POLICY IF EXISTS "Tenant Access Messages" ON messages;
CREATE POLICY "Tenant Access Messages" ON messages 
FOR ALL USING (
    (tenant_id = get_auth_tenant_id()) OR (is_super_admin())
);

-- CONVERSATIONS
DROP POLICY IF EXISTS "Tenant Access Conversations" ON conversations;
CREATE POLICY "Tenant Access Conversations" ON conversations 
FOR ALL USING (
    (tenant_id = get_auth_tenant_id()) OR (is_super_admin())
);

-- 4. Maintenance
ANALYZE users;
ANALYZE agents;
ANALYZE conversations;
ANALYZE messages;
