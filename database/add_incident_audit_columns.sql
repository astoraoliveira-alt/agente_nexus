-- Migration: Add Audit Trail for Incident Resolution
-- Adds resolved_by to track which user resolved the incident

ALTER TABLE incidents 
ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_incidents_resolved_by ON incidents(resolved_by);
