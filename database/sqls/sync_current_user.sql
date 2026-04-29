-- =============================================
-- FIX MISSING USER IN PUBLIC.USERS
-- Purpose: Ensures the current authenticated user has a record in public.users 
-- to satisfy FK constraints in audit logs.
-- =============================================

INSERT INTO public.users (id, email, full_name, tenant_id, role, status)
SELECT 
    id, 
    email, 
    COALESCE(raw_user_meta_data->>'full_name', email), 
    NULL, -- Tenant can be assigned via UI later
    'super_admin', -- Default to super_admin for recovery if needed
    'active'
FROM auth.users
WHERE id = '3525b6c8-d919-40bf-ab0e-9e20d9355af4' -- The ID from your error log
ON CONFLICT (id) DO UPDATE 
SET status = 'active';

-- Bonus: Generic trigger to keep public.users in sync with auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, status)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'full_name', new.email), 'viewer', 'active')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Uncomment below to enable auto-sync for future users
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DO $$
BEGIN
  RAISE NOTICE 'User 3525b6c8... synchronized successfully.';
END $$;
