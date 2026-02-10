-- =============================================
-- FIX: Knowledge Base RLS Policies (Public Dev Mode)
-- Purpose: Allow access in development/simulated auth environment.
-- Warning: These policies are permissive (USING true) to match the project's 'Public Dev' pattern.
-- =============================================

-- Ensure RLS is enabled
ALTER TABLE agent_knowledge ENABLE ROW LEVEL SECURITY;

-- Drop all previous restrictive policies
DROP POLICY IF EXISTS "Knowledge Base Read Access" ON agent_knowledge;
DROP POLICY IF EXISTS "Knowledge Base Manage Access" ON agent_knowledge;
DROP POLICY IF EXISTS "Users can view knowledge for their tenant" ON agent_knowledge;
DROP POLICY IF EXISTS "Users can manage knowledge for their tenant" ON agent_knowledge;

-- 1. Create Public Policies (Compatible with Simulated Auth)
CREATE POLICY "Public Read Knowledge" ON agent_knowledge 
    FOR SELECT 
    USING (true);

CREATE POLICY "Public Manage Knowledge" ON agent_knowledge 
    FOR ALL 
    USING (true)
    WITH CHECK (true);

-- 2. Grant necessary permissions to ALL roles used by Supabase
GRANT ALL ON agent_knowledge TO anon;
GRANT ALL ON agent_knowledge TO authenticated;
GRANT ALL ON agent_knowledge TO postgres;
GRANT ALL ON agent_knowledge TO service_role;
