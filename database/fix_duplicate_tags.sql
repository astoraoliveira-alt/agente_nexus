-- Fix Duplicate Tags
-- Cleans up existing contacts that have duplicate tags in their array

UPDATE contacts
SET tags = ARRAY(SELECT DISTINCT UNNEST(tags))
WHERE tags IS NOT NULL;
