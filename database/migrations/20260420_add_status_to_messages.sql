-- Migration: Add Status and Remote Tracking to Messages
-- Description: Adds status column to track delivery (sent, delivered, failed) and ensures remote_id index.
-- ============================================================

DO $$ 
BEGIN
    -- 1. Adiciona coluna status se não existir
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'messages' 
          AND column_name = 'status'
    ) THEN
        ALTER TABLE public.messages ADD COLUMN status VARCHAR(20) DEFAULT 'sent';
        RAISE NOTICE 'Added status column to messages table.';
    END IF;

    -- 2. Garante índice no remote_id para busca rápida no Webhook
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE tablename = 'messages' 
          AND indexname = 'idx_messages_remote_id'
    ) THEN
        CREATE INDEX idx_messages_remote_id ON public.messages(remote_id);
    END IF;

END $$;
