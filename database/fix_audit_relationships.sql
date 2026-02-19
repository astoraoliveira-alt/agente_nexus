-- =============================================
-- FIX AUDIT RELATIONSHIPS (V3 - With Data Cleanup)
-- Purpose: Enable user name lookup in audit logs via PostgREST joins.
-- Handles: Missing PKs and Orphaned Data.
-- =============================================

DO $$
BEGIN
    -- 0. ENSURE USERS.ID IS PRIMARY KEY
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_schema = 'public' AND table_name = 'users' AND constraint_type = 'PRIMARY KEY'
    ) THEN
        BEGIN
            ALTER TABLE public.users ADD PRIMARY KEY (id);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not add Primary Key to users. Possibly already exists with different name.';
        END;
    END IF;

    -- 1. CLEANUP ORPHANED REFERENCES (Crucial step)
    -- Set actor_id to NULL if the user does not exist in the users table
    
    UPDATE public.agent_audit_logs 
    SET actor_id = NULL 
    WHERE actor_id IS NOT NULL 
    AND actor_id NOT IN (SELECT id FROM public.users);

    UPDATE public.plan_audit_logs 
    SET actor_id = NULL 
    WHERE actor_id IS NOT NULL 
    AND actor_id NOT IN (SELECT id FROM public.users);

    UPDATE public.audit_logs 
    SET actor_id = NULL 
    WHERE actor_id IS NOT NULL 
    AND actor_id NOT IN (SELECT id FROM public.users);

    -- 2. APPLY FOREIGN KEYS
    
    -- Agent Audit Logs
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_agent_audit_logs_actor') THEN
        ALTER TABLE public.agent_audit_logs 
        ADD CONSTRAINT fk_agent_audit_logs_actor 
        FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;
    END IF;

    -- Plan Audit Logs
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_plan_audit_logs_actor') THEN
        ALTER TABLE public.plan_audit_logs 
        ADD CONSTRAINT fk_plan_audit_logs_actor 
        FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;
    END IF;

    -- Global Audit Logs
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_audit_logs_actor') THEN
        ALTER TABLE public.audit_logs 
        ADD CONSTRAINT fk_audit_logs_actor 
        FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;
    END IF;

    RAISE NOTICE 'Audit logs cleaned and relationships fixed successfully.';
END $$;
