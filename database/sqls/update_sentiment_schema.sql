-- Migration: Add Sentiment Analysis Support
-- 1. Add 'sentiment' to conversations for historical record
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sentiment VARCHAR(50);
-- 2. Add 'sentiment' to contacts for current mood (optional, but good for CRM)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sentiment VARCHAR(50);

-- 3. We do NOT need to change lifecycle_status enum because it's VARCHAR in the schema:
-- TYPE VARCHAR(50) DEFAULT 'lead'
