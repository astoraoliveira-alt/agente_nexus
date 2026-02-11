-- CHECK USER STATUS
-- Run this in Supabase SQL Editor to see what's happening with carlos@davos.ai

SELECT 
    au.id as auth_id, 
    au.email as auth_email, 
    au.last_sign_in_at,
    pu.id as public_id, 
    pu.email as public_email, 
    pu.provider_id, 
    pu.status, 
    pu.role
FROM auth.users au
FULL OUTER JOIN public.users pu ON au.email = pu.email
WHERE au.email = 'carlos@davos.ai' OR pu.email = 'carlos@davos.ai';
