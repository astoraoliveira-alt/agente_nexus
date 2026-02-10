-- =============================================
-- FIX: Governance RLS Policies (Super Admin Visibility)
-- Purpose: Allow Super Admins to see data across all tenants, 
-- while regular users stay isolated to their 'Home' tenant.
-- =============================================

-- 1. EVALUATIONS
-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Allow tenant read access" ON evaluations;

-- Create dynamic role-aware policy
CREATE POLICY "Governance Read Access" ON evaluations
    FOR SELECT
    USING (
        -- Option A: User is a Super Admin
        (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
        OR 
        -- Option B: User belongs to the tenant
        tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
    );

-- 2. INCIDENTS
-- Enable RLS just in case
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

-- Drop existing (if any)
DROP POLICY IF EXISTS "Incidents Read Access" ON incidents;

-- Create role-aware policy
CREATE POLICY "Incidents Read Access" ON incidents
    FOR SELECT
    USING (
        (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
        OR 
        tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
    );

-- 3. CONSUMPTION METRICS
-- Ensure management visibility for billing
ALTER TABLE consumption_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Consumption Read Access" ON consumption_metrics;

CREATE POLICY "Consumption Read Access" ON consumption_metrics
    FOR SELECT
    USING (
        (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
        OR 
        tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
    );

-- Grant necessary permissions
GRANT SELECT ON evaluations TO authenticated;
GRANT SELECT ON incidents TO authenticated;
GRANT SELECT ON consumption_metrics TO authenticated;
