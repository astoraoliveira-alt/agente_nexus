-- =============================================
-- FIX CONTACT UNIQUE CONSTRAINT
-- Purpose: Allow same identifier (phone) in different tenants
-- Fixes: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- =============================================

-- 1. Drop the old global unique constraint
-- Note: We use a DO block to find the constraint name dynamically if it's auto-generated,
-- but usually it's "contacts_identifier_key" or similar.
-- Checking schema: "identifier VARCHAR(255) NOT NULL UNIQUE" implies a constraint.

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find and drop the unique constraint on just 'identifier'
    FOR r IN 
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = connamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'contacts'
          AND con.contype = 'u'
          AND array_length(con.conkey, 1) = 1
          AND (SELECT attname FROM pg_attribute WHERE attrelid = rel.oid AND attnum = con.conkey[1]) = 'identifier'
    LOOP
        EXECUTE 'ALTER TABLE contacts DROP CONSTRAINT ' || r.conname;
        RAISE NOTICE 'Dropped constraint: %', r.conname;
    END LOOP;
END$$;

-- 2. Add the new Composite Unique Constraint
-- This allows (tenant_id, identifier) to be unique, supporting multitenancy.
ALTER TABLE contacts
ADD CONSTRAINT contacts_tenant_identifier_key UNIQUE (tenant_id, identifier);

-- 3. Verify
-- The index should now be created automatically for the unique constraint.
