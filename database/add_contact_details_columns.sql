-- Migration: Add detailed contact fields
-- Fixes missing columns in contacts table

DO $$
BEGIN
    -- Add email column if not exists
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'contacts'
        AND column_name = 'email'
    ) THEN
        ALTER TABLE contacts ADD COLUMN email VARCHAR(255);
        CREATE INDEX idx_contacts_email ON contacts(email);
    END IF;

    -- Add phone column if not exists
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'contacts'
        AND column_name = 'phone'
    ) THEN
        ALTER TABLE contacts ADD COLUMN phone VARCHAR(50);
        CREATE INDEX idx_contacts_phone ON contacts(phone);
    END IF;
END $$;
