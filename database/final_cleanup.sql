-- Final Cleanup Script
-- 1. Drops the problematic function to prevent future regressions
-- 2. Cleans up any users created by the regression

-- Prevent future accidents
DROP FUNCTION IF EXISTS get_or_create_whatsapp_user(UUID, VARCHAR, VARCHAR);

-- Clean up users again
DELETE FROM users 
WHERE email LIKE '%@whatsapp.gw' 
  AND role = 'viewer';
