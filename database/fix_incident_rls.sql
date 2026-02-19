-- Fix: Add missing RLS policies for Incidents
-- Currently only SELECT is allowed, blocking resolution (UPDATE) and manual creation (INSERT)

DROP POLICY IF EXISTS "Tenant Insert Incidents" ON incidents;
CREATE POLICY "Tenant Insert Incidents" ON incidents 
FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Tenant Update Incidents" ON incidents;
CREATE POLICY "Tenant Update Incidents" ON incidents 
FOR UPDATE USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Tenant Delete Incidents" ON incidents;
CREATE POLICY "Tenant Delete Incidents" ON incidents 
FOR DELETE USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- Also ensure Super Admin can do everything
DROP POLICY IF EXISTS "Super Admin Manage Incidents" ON incidents;
CREATE POLICY "Super Admin Manage Incidents" ON incidents 
FOR ALL USING (auth.uid() IN (SELECT id FROM users WHERE role = 'super_admin'));
