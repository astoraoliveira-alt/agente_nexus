-- =============================================
-- CLEANUP: Anonymous "Trash" Contacts
-- Description: Removes contacts with '??' as name and no contact info.
-- =============================================

DELETE FROM contacts
WHERE name = '??'
  AND phone IS NULL
  AND email IS NULL
  AND identifier LIKE 'web-visitor-%';

-- Logging action
INSERT INTO audit_logs (
    tenant_id,
    actor_id,
    actor_name,
    action,
    target_type,
    target_id,
    details
)
SELECT 
    id,
    NULL,
    'System',
    'CLEANUP_CRM',
    'contacts',
    NULL,
    'Cleaned up anonymous web-visitor contacts without identification.'
FROM companies;
