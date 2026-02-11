
-- Migration: Add evolution_token to agents table
-- Purpose: Store the unique API Key for each Evolution instance linked to an agent.
-- This allows multi-tenancy where each agent has its own WhatsApp connection.

ALTER TABLE "public"."agents" 
ADD COLUMN IF NOT EXISTS "evolution_token" text;

-- Comment for documentation
COMMENT ON COLUMN "public"."agents"."evolution_token" IS 'The unique API Key for the Evolution API instance linked to this agent.';
