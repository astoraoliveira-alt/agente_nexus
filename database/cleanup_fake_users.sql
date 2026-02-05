-- Cleanup script to remove incorrectly created system users
-- These users were created by the n8n_rpc logic for WhatsApp contacts

DELETE FROM users 
WHERE email LIKE '%@whatsapp.gw' 
  AND role = 'viewer';

-- Optional: Verify deletion
-- SELECT count(*) FROM users WHERE email LIKE '%@whatsapp.gw';
