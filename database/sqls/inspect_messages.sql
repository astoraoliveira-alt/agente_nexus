-- Query to inspect inserted messages details
-- conversation_id: 6c599831-6c67-4533-8c55-c27b70665ad6

SELECT 
    id,
    conversation_id,
    sender_type, -- sender_type matches enum?
    content,
    external_order,
    created_at,
    metadata
FROM messages 
WHERE conversation_id = '6c599831-6c67-4533-8c55-c27b70665ad6'
ORDER BY external_order ASC;
