-- Simulate checking the function output for the specific user "carlos@davos.ai"
SELECT public.get_auth_tenant_id();

-- Let's check the users table definition and policies
\d public.users;
\d public.campaigns;
