-- Migration: Update Users Table for Database Agnostic Auth
-- Description: Adds provider_id and status to decouple from Supabase Auth.

-- 1. Add new columns
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'supabase',
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending', -- pending, active, blocked, invited
ADD COLUMN IF NOT EXISTS owner_id UUID NULL;

-- 2. Create Indices for Lookup Performance
CREATE INDEX IF NOT EXISTS idx_users_provider_id ON public.users(provider_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);

-- 3. Data Migration: Backfill provider_id from Supabase Auth (Soft Link)
-- We cast auth.users.id to text because provider_id is generic varchar
DO $$
BEGIN
    UPDATE public.users pu
    SET provider_id = au.id::text
    FROM auth.users au
    WHERE pu.email = au.email
    AND pu.provider_id IS NULL;
END $$;

-- 4. Data Migration: Sync status from legacy is_active column
UPDATE public.users
SET status = CASE
    WHEN is_active = true THEN 'active'
    ELSE 'blocked'
END
WHERE status = 'pending'  -- Only touch rows that haven't been manually set (default)
AND id IN (SELECT id FROM public.users); -- Safety check

-- 5. Ensure Super Admin is Active (Safety Net)
UPDATE public.users
SET status = 'active', role = 'super_admin'
WHERE email = 'carlos@davos.ai';
