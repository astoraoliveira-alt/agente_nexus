-- =============================================
-- Migration: Support Base64 Audio
-- Change audio_url and image_url from VARCHAR(1024) to TEXT
-- =============================================

ALTER TABLE messages 
    ALTER COLUMN audio_url TYPE TEXT,
    ALTER COLUMN image_url TYPE TEXT; -- Future proofing for images too

-- Optional: Add a comment to documented schema
COMMENT ON COLUMN messages.audio_url IS 'Stores URL or Base64 Data URI (TEXT)';
