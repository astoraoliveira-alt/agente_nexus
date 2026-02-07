-- Migration: Add Sentiment Column to Contacts and Conversations
-- Required for Save Evaluation RPC to work correctly with CRM sync.

-- 1. Add sentiment to contacts if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'contacts'
        AND column_name = 'sentiment'
    ) THEN
        ALTER TABLE contacts ADD COLUMN sentiment VARCHAR(50);
    END IF;
END $$;

-- 2. Add sentiment to conversations if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'conversations'
        AND column_name = 'sentiment'
    ) THEN
        ALTER TABLE conversations ADD COLUMN sentiment VARCHAR(50);
    END IF;
END $$;

-- 3. Add lifecycle_status to contacts if not exists (Double Check)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'contacts'
        AND column_name = 'lifecycle_status'
    ) THEN
        ALTER TABLE contacts ADD COLUMN lifecycle_status VARCHAR(50) DEFAULT 'lead';
    END IF;
END $$;
