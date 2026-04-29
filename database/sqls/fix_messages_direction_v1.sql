-- Migration: Fix Messages Table Direction
-- Ensures the table matches the expected Hub/CRM contract for message direction

DO $$ 
BEGIN
    -- 1. Add direction column if not exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'messages' 
          AND column_name = 'direction'
    ) THEN
        ALTER TABLE public.messages ADD COLUMN direction VARCHAR(20) DEFAULT 'outbound';
        CREATE INDEX IF NOT EXISTS idx_messages_direction ON public.messages(direction);
        RAISE NOTICE 'Added direction column to messages table.';
    END IF;

    -- 2. Add message_type (Legacy Compatibility)
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'messages' 
          AND column_name = 'message_type'
    ) THEN
        ALTER TABLE public.messages ADD COLUMN message_type VARCHAR(50) DEFAULT 'text';
    END IF;

    -- 3. Add remote_id if not exists (WA mapping)
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'messages' 
          AND column_name = 'remote_id'
    ) THEN
        ALTER TABLE public.messages ADD COLUMN remote_id TEXT;
    END IF;

END $$;

COMMENT ON COLUMN public.messages.direction IS 'Inbound ou Outbound (Hub V22).';
