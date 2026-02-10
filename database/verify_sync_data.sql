-- Query to verify inserted data
-- conversation_id: 6c599831-6c67-4533-8c55-c27b70665ad6
-- call_id: 019c3a3e-6f26-7ee9-acdf-e9b25279e59a

DO $$
DECLARE
    v_messages_count INT;
    v_logs_count INT;
BEGIN
    SELECT COUNT(*) INTO v_messages_count
    FROM messages 
    WHERE conversation_id = '6c599831-6c67-4533-8c55-c27b70665ad6';
    
    SELECT COUNT(*) INTO v_logs_count
    FROM integration_logs
    WHERE provider = 'vapi' AND external_id = '019c3a3e-6f26-7ee9-acdf-e9b25279e59a';
    
    RAISE NOTICE 'Messages Count: %', v_messages_count;
    RAISE NOTICE 'Logs Count: %', v_logs_count;
    
    -- Check specific rows
    PERFORM * FROM messages WHERE conversation_id = '6c599831-6c67-4533-8c55-c27b70665ad6' LIMIT 5;
    
END $$;
