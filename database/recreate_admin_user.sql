-- RECREATE ADMIN USER (Auth V2 Fix)
-- This script creates the auth user for 'carlos@davos.ai' and links it to the existing public profile.
-- Password will be: 123456

BEGIN;

-- 1. Create user in auth.users if not exists
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
)
SELECT
    '00000000-0000-0000-0000-000000000000',
    uuid_generate_v4(), -- Generate a new Auth ID
    'authenticated',
    'authenticated',
    'carlos@davos.ai',
    crypt('123456', gen_salt('bf')), -- Password: 123456
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Carlos Admin"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
WHERE NOT EXISTS (
    SELECT 1 FROM auth.users WHERE email = 'carlos@davos.ai'
);

-- 2. Link public.users to the new auth.users ID
UPDATE public.users
SET 
    provider_id = (SELECT id FROM auth.users WHERE email = 'carlos@davos.ai' LIMIT 1)::text,
    status = 'active',
    role = 'super_admin',
    provider = 'supabase'
WHERE email = 'carlos@davos.ai';

COMMIT;

-- Verification Output
SELECT id, email, role, status, provider_id FROM public.users WHERE email = 'carlos@davos.ai';
