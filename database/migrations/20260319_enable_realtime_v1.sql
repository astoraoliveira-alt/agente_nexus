-- Migration: Enable Supabase Realtime for Financial and Chat Tables
-- Purpose: Remove polling architecture and switch to event-driven updates.

BEGIN;

-- 1. Ensure the 'supabase_realtime' publication exists (Standard in Supabase)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

-- 2. Add high-frequency tables to the realtime engine
-- This allows the @supabase/supabase-js library to listen for changes via WebSockets.
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.incidents;

-- 3. Verify current RLS (Row Level Security)
-- Realtime respects RLS. These tables should already have tenant_id filtering.
COMMENT ON TABLE public.messages IS 'Realtime enabled for Phase 2. Ensure RLS filters by tenant_id to prevent data leakage.';

COMMIT;
