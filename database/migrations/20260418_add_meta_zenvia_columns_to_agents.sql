-- Migration: Add missing Meta and Zenvia integration columns to agents table
-- Date: 2026-04-18
-- Description: Adds columns required for Official WhatsApp (Meta) and Zenvia integrations.

BEGIN;

ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS meta_waba_id TEXT,
ADD COLUMN IF NOT EXISTS meta_verify_token TEXT;

-- Update comments for clarity
COMMENT ON COLUMN public.agents.meta_waba_id IS 'Meta WhatsApp Business Account ID';
COMMENT ON COLUMN public.agents.meta_verify_token IS 'Meta Webhook Verification Token (Webhook setup)';

COMMIT;
