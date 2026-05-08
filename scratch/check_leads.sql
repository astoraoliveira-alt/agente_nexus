SELECT 
    oq.contact_phone, 
    oq.status, 
    oq.response_detected, 
    oq.conversation_id,
    (SELECT count(*) FROM messages m WHERE m.conversation_id = oq.conversation_id AND m.sender_type = 'user') as inbound_msgs
FROM outbound_queue oq
WHERE oq.campaign_id = (SELECT id FROM campaigns WHERE name ILIKE '%4 contatos%' LIMIT 1);
