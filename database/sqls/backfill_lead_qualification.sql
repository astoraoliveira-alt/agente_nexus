-- Migration: Fix & Backfill Contact Qualification
-- Description: Ensures 'updated_at' exists and qualifies existing leads based on evaluations.

-- 1. Ensure updated_at exists (Emergency Sync)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Backfill Logic
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 
            c.identifier,
            c.tenant_id,
            e.score,
            e.tags as eval_tags
        FROM evaluations e
        JOIN conversations conv ON e.conversation_id = conv.id
        JOIN contacts c ON conv.user_identifier = c.identifier AND conv.tenant_id = c.tenant_id
    ) LOOP
        UPDATE contacts
        SET 
            lifecycle_status = CASE 
                WHEN r.score >= 80 THEN 'Lead Quente'
                WHEN r.score >= 50 THEN 'Interesse Médio'
                ELSE 'Interesse Baixo'
            END,
            tags = array_cat(COALESCE(tags, '{}'::text[]), r.eval_tags),
            updated_at = NOW()
        WHERE identifier = r.identifier 
          AND tenant_id = r.tenant_id;
    END LOOP;
END $$;

-- 3. Deduplicate tags
UPDATE contacts 
SET tags = (SELECT array_agg(DISTINCT t) FROM unnest(tags) t)
WHERE tags IS NOT NULL AND array_length(tags, 1) > 0;
