-- CHECK HERMES USER STATUS
SELECT 
    au.id as auth_id, 
    au.email as auth_email, 
    au.email_confirmed_at,
    au.last_sign_in_at,
    pu.id as public_id, 
    pu.email as public_email, 
    pu.provider_id, 
    pu.status, 
    pu.role
FROM auth.users au
FULL OUTER JOIN public.users pu ON au.email = pu.email
WHERE au.email = 'hermes@gmail.com' OR pu.email = 'hermes@gmail.com';
