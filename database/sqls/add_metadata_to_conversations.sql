-- Migration: Add metadata column to conversations for CRM/WhatsApp data
-- Version: 1.1.0
-- Compliance: ISO 42001 (Traceability)

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Update Column Comment
COMMENT ON COLUMN conversations.metadata IS 'Rich metadata from external channels (WhatsApp pushName, profilePic, technical IDs).';
