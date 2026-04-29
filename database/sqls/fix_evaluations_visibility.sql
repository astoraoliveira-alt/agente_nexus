-- =============================================
-- FIX: Evaluation Visibility for Simulated Auth
-- Description: Updates RLS policies to allow public read during development.
-- =============================================

-- Drop the restrictive policy
DROP POLICY IF EXISTS "Allow tenant read access" ON evaluations;

-- Create Public Read Policy (Matches policies.sql pattern)
-- This allows the frontend to see data while using Simulated Auth
CREATE POLICY "Public Read Evaluations" ON evaluations
    FOR SELECT
    USING (true);

-- Also allow INSERT/UPDATE if needed (though usually done via RPC Security Definer)
CREATE POLICY "Public Insert Evaluations" ON evaluations
    FOR INSERT
    WITH CHECK (true);

-- Ensure RLS is still on, just with public policies
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
