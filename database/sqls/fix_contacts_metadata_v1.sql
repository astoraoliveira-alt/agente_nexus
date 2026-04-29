-- Migration: Fix Contacts Table Metadata
-- Ensures the table matches the expected observability contract

DO $$ 
BEGIN
    -- 1. Add metadata column if not exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'contacts' 
          AND column_name = 'metadata'
    ) THEN
        ALTER TABLE public.contacts ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
        CREATE INDEX IF NOT EXISTS idx_contacts_metadata ON public.contacts USING GIN (metadata);
        RAISE NOTICE 'Added metadata column to contacts table.';
    END IF;

    -- 2. Add extra_info if not exists (Legacy Support)
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'contacts' 
          AND column_name = 'extra_info'
    ) THEN
        ALTER TABLE public.contacts ADD COLUMN extra_info JSONB DEFAULT '{}'::jsonb;
    END IF;

    -- 3. Ensure updated_at exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'contacts' 
          AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.contacts ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;

END $$;

COMMENT ON COLUMN public.contacts.metadata IS 'Metadata para rastreabilidade de campanhas e integração (Porteiro V52).';
