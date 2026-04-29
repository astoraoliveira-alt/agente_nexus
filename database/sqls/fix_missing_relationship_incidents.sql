-- ==============================================================================
-- FIX: Missing `incidents` -> `conversations` Relationship (PGRST200 Error)
-- ==============================================================================

BEGIN;

DO $$ 
BEGIN 
    -- 1. Ensure the column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'incidents' AND column_name = 'conversation_id') THEN
        ALTER TABLE incidents ADD COLUMN conversation_id UUID;
    END IF;

    -- 2. Ensure Primary Key on conversations exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'conversations_pkey') THEN
        ALTER TABLE conversations ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);
    END IF;

    -- 3. Check and add the formal FOREIGN KEY constraint for Supabase/PostgREST to detect
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'incidents_conversation_id_fkey' 
          AND table_name = 'incidents'
    ) THEN
        ALTER TABLE incidents 
        ADD CONSTRAINT incidents_conversation_id_fkey 
        FOREIGN KEY (conversation_id) 
        REFERENCES conversations(id) 
        ON DELETE SET NULL; -- Or CASCADE, depending on business rules
    END IF;

    -- 4. Re-create the index for performance mapping
    CREATE INDEX IF NOT EXISTS idx_incidents_conversation ON incidents(conversation_id);

END $$;

COMMIT;

-- 5. Force PostgREST to reload its schema cache so it sees the new foreign key
NOTIFY pgrst, 'reload_schema';
