SELECT 
    conv.user_identifier as contact,
    m.direction,
    m.created_at,
    m.content
FROM messages m
JOIN conversations conv ON m.conversation_id = conv.id
WHERE m.created_at >= date_trunc('day', NOW())
ORDER BY m.created_at DESC;
