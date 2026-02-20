-- ==============================================================================
-- FIX: Missing `context_window` Column on `agents` table (PGRST204 Error)
-- ==============================================================================

BEGIN;

DO $$ 
BEGIN 
    -- 1. Ensure the column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'context_window') THEN
        ALTER TABLE agents ADD COLUMN context_window INTEGER DEFAULT 10;
    END IF;

END $$;

COMMIT;

-- 2. Force PostgREST to reload its schema cache so it sees the new column
NOTIFY pgrst, 'reload_schema';
