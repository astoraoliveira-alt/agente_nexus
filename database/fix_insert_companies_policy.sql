-- FIX: Allow Company Creation (RLS)
-- Purpose: Add missing INSERT policy for companies table.
-- Currently, companies has RLS enabled but only SELECT/UPDATE policies, blocking INSERT.

-- 1. Create "Public Insert Companies" Policy
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'companies' 
        AND policyname = 'Public Insert Companies'
    ) THEN
        CREATE POLICY "Public Insert Companies" ON companies FOR INSERT WITH CHECK (true);
        RAISE NOTICE 'Created policy Public Insert Companies';
    ELSE
        RAISE NOTICE 'Policy Public Insert Companies already exists';
    END IF;
END $$;

-- 2. Create "Public Delete Companies" Policy (for completeness)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'companies' 
        AND policyname = 'Public Delete Companies'
    ) THEN
        CREATE POLICY "Public Delete Companies" ON companies FOR DELETE USING (true);
        RAISE NOTICE 'Created policy Public Delete Companies';
    ELSE
        RAISE NOTICE 'Policy Public Delete Companies already exists';
    END IF;
END $$;
