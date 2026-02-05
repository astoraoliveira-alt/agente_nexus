-- Fix inconsistent channels for WhatsApp contacts
-- Records with channel=NULL but originating from Evolution API (WhatsApp)

UPDATE contacts
SET channel = 'whatsapp'
WHERE channel IS NULL 
AND (
    -- Case 1: Platform is explicitly iOS/Android (Mobile API)
    (extra_info->>'platform') IN ('ios', 'android')
    OR 
    -- Case 2: Platform is 'web' BUT serverURL points to Evolution API (not Landing Page)
    (
        (extra_info->>'platform') = 'web' 
        AND (extra_info->>'serverURL') ILIKE '%evolution%'
    )
);

-- Optional: Verify the update
-- SELECT id, name, channel, extra_info FROM "Contact" WHERE channel = 'whatsapp' AND updated_at > NOW() - INTERVAL '1 minute';
