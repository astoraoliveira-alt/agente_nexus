-- =============================================
-- PERFORMANCE OPTIMIZATION: RLS Refactor
-- Description: Implement session-based tenant lookup to eliminate subquery overhead in RLS.
-- Target: Index 0 (Auth) < 200ms
-- =============================================

-- 1. Helper Function: get_auth_tenant_id
-- Fetches tenant_id from JWT metadata (app_metadata or user_metadata)
CREATE OR REPLACE FUNCTION get_auth_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id TEXT;
BEGIN
    -- 1. Try to get tenant_id from JWT metadata (fastest)
    v_tenant_id := current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id';
    
    -- 2. Fallback to user_metadata
    IF v_tenant_id IS NULL THEN
        v_tenant_id := current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'tenant_id';
    END IF;

    -- 3. Last fallback: Query the users table once and set a session variable for subsequent calls
    -- This is only needed if JWT metadata is not populated.
    IF v_tenant_id IS NULL THEN
        -- Check if we already have it in session to avoid re-querying
        v_tenant_id := current_setting('davos.current_tenant_id', true);
        
        IF v_tenant_id IS NULL OR v_tenant_id = '' THEN
            SELECT tenant_id::TEXT INTO v_tenant_id
            FROM public.users
            WHERE id = auth.uid();
            
            -- Set session variable (lasts for the duration of the request/transaction)
            PERFORM set_config('davos.current_tenant_id', v_tenant_id, true);
        END IF;
    END IF;

    RETURN v_tenant_id::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$;

-- 2. Refactor RLS Policies for Critical Tables

-- COMPANIES
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Read Own Company" ON companies;
CREATE POLICY "Tenant Read Own Company" ON companies 
FOR SELECT USING (id = get_auth_tenant_id());

DROP POLICY IF EXISTS "Tenant Update Own Company" ON companies;
CREATE POLICY "Tenant Update Own Company" ON companies 
FOR UPDATE USING (id = get_auth_tenant_id());

-- USERS (HOTSPOT Index 0)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Read Users" ON users;
CREATE POLICY "Tenant Read Users" ON users 
FOR SELECT USING (tenant_id = get_auth_tenant_id());

-- AGENTS (HOTSPOT Index 4)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Manage Agents" ON agents;
CREATE POLICY "Tenant Manage Agents" ON agents 
FOR ALL USING (tenant_id = get_auth_tenant_id());

-- MESSAGES
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Access Messages" ON messages;
CREATE POLICY "Tenant Access Messages" ON messages 
FOR ALL USING (tenant_id = get_auth_tenant_id());

-- CONVERSATIONS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Access Conversations" ON conversations;
CREATE POLICY "Tenant Access Conversations" ON conversations 
FOR ALL USING (tenant_id = get_auth_tenant_id());

-- CONSUMPTION METRICS
ALTER TABLE consumption_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Read Consumption" ON consumption_metrics;
CREATE POLICY "Tenant Read Consumption" ON consumption_metrics 
FOR SELECT USING (tenant_id = get_auth_tenant_id());

-- 3. Maintenance
ANALYZE users;
ANALYZE companies;
ANALYZE agents;
ANALYZE messages;
ANALYZE conversations;
