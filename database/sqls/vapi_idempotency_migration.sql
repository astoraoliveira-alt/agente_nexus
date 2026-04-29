-- Migration: Add External Fields to Messages
-- Purpose: Enable idempotency for VAPI sync

-- 1. Add Columns if they don't exist
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS external_order INT,
ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);

-- 2. Create Unique Constraint for Idempotency
-- We use a unique index which acts as a constraint for ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_idempotency 
ON messages (conversation_id, external_order) 
WHERE external_order IS NOT NULL;
