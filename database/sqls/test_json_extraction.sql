-- TEST: JSON Body Extraction
-- Purpose: Verify if 'call' is inside 'message' or sibling of 'message'
DO $$
DECLARE
    v_body JSONB := '{"message":{"timestamp":1770503851031,"type":"status-update","status":"ended","endedReason":"silence-timed-out","artifact":{"messages":[{"role":"bot","message":"Olá"}]}},"call":{"id":"TEST-CALL-ID","status":"ended"}}';
    
    v_call_id_1 TEXT;
    v_call_id_2 TEXT;
    v_status_1 TEXT;
    v_status_2 TEXT;
BEGIN
    -- Path 1: Standard (message -> call -> id)
    v_call_id_1 := v_body->'message'->'call'->>'id';
    v_status_1 := v_body->'message'->'call'->>'status';
    
    -- Path 2: Root (call -> id)
    v_call_id_2 := v_body->'call'->>'id';
    v_status_2 := v_body->'call'->>'status';
    
    RAISE NOTICE 'Path 1 (message->call): ID=%, Status=%', v_call_id_1, v_status_1;
    RAISE NOTICE 'Path 2 (root->call): ID=%, Status=%', v_call_id_2, v_status_2;
    
    IF v_call_id_1 IS NULL AND v_call_id_2 IS NOT NULL THEN
        RAISE NOTICE 'CONCLUSION: Payload has call at ROOT level (sibling of message)';
    ELSIF v_call_id_1 IS NOT NULL THEN
        RAISE NOTICE 'CONCLUSION: Payload has call INSIDE message (standard)';
    ELSE
        RAISE NOTICE 'CONCLUSION: Both paths failed';
    END IF;
END $$;
