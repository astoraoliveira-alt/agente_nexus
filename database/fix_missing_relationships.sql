-- FIX MISSING RELATIONSHIPS & RELOAD SCHEMA CACHE
-- The error PGRST200 "Could not find a relationship" usually means stale cache or missing FKs.

-- 1. Ensure Foreign Keys Exist (Idempotent)
DO $$
BEGIN
    -- Ensure Agents has PK (Critical for FKs)
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'agents_pkey') THEN
        ALTER TABLE agents ADD CONSTRAINT agents_pkey PRIMARY KEY (id);
    END IF;

    -- Ensure Conversations has PK (Critical for FKs)
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'conversations_pkey') THEN
        ALTER TABLE conversations ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);
    END IF;

    -- Conversations -> Agents
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'conversations_agent_id_fkey') THEN
        ALTER TABLE conversations ADD CONSTRAINT conversations_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(id);
    END IF;

    -- Incidents -> Agents
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'incidents_agent_id_fkey') THEN
        ALTER TABLE incidents ADD CONSTRAINT incidents_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(id);
    END IF;

    -- Evaluations -> Agents
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'evaluations_agent_id_fkey') THEN
        ALTER TABLE evaluations ADD CONSTRAINT evaluations_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(id);
    END IF;

    -- Evaluations -> Conversations
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'evaluations_conversation_id_fkey') THEN
        ALTER TABLE evaluations ADD CONSTRAINT evaluations_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2. Force PostgREST Schema Cache Reload
-- This is often required after DDL changes for the API to "see" new relationships.
NOTIFY pgrst, 'reload_schema';
