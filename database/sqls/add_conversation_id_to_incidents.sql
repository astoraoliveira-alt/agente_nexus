-- Migration: Add conversation_id to Incidents
-- Enables linking auto-generated incidents to specific conversations

ALTER TABLE incidents 
ADD COLUMN conversation_id UUID REFERENCES conversations(id);

CREATE INDEX idx_incidents_conversation ON incidents(conversation_id);
