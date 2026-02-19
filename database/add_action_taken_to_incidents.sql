-- Migration: Add action_taken to Incidents
-- Enables recording the steps taken to resolve an AI incident

ALTER TABLE incidents 
ADD COLUMN IF NOT EXISTS action_taken TEXT;
