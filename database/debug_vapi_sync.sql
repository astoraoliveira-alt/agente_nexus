-- DEBUG SCRIPT: VAPI Sync Diagnostics
-- Purpose: Identify exactly which constraint is failing or if data is missing

-- 1. Check existing indexes on messages table
SELECT 
    schemaname, 
    tablename, 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'messages';

-- 2. Create a DEBUG version of the RPC
-- This version removes ON CONFLICT to see the primitive error
-- And adds RAISE NOTICE for variable inspection
CREATE OR REPLACE FUNCTION sync_vapi_call_debug(
    p_tenant_id UUID,
    p_vapi_payload JSONB,
    p_user_identifier VARCHAR DEFAULT NULL,
    p_user_name VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_call_id VARCHAR;
    v_conversation_id UUID;
    v_agent_id UUID;
    v_messages JSONB;
    v_msg JSONB;
    v_role VARCHAR;
    v_content TEXT;
    v_external_order INT;
    v_inserted_count INT := 0;
BEGIN
    RAISE NOTICE '--- START DEBUG ---';
    
    v_call_id := p_vapi_payload->'message'->'call'->>'id';
    v_messages := p_vapi_payload->'message'->'artifact'->'messages';
    
    RAISE NOTICE 'Call ID: %, Messages Count: %', v_call_id, jsonb_array_length(v_messages);

    -- Minimal Agent Resolution (Hardcoded for debug safety)
    SELECT id INTO v_agent_id FROM agents WHERE tenant_id = p_tenant_id LIMIT 1;
    RAISE NOTICE 'Resolved Agent ID: %', v_agent_id;

    -- Minimal Conversation Sync
    SELECT (get_or_create_conversation(
        p_tenant_id,
        v_agent_id,
        COALESCE(p_user_identifier, 'debug-' || v_call_id),
        COALESCE(p_user_name, 'Debug User'),
        jsonb_build_object('vapi_call_id', v_call_id, 'source', 'debug'),
        NULL
    )->>'id')::UUID INTO v_conversation_id;
    
    RAISE NOTICE 'Resolved Conversation ID: %', v_conversation_id;

    -- LOOP MESSAGES WITHOUT ON CONFLICT
    IF v_messages IS NOT NULL THEN
        FOR v_msg IN SELECT * FROM jsonb_array_elements(v_messages)
        LOOP
            v_role := v_msg->>'role';
            v_content := v_msg->>'message';
            v_external_order := (v_msg->>'order')::INT;
            
            RAISE NOTICE 'Processing Msg Order: %, Role: %', v_external_order, v_role;
            
            IF v_role IN ('user', 'bot', 'assistant') THEN
                IF v_role = 'bot' OR v_role = 'assistant' THEN v_role := 'ai'; END IF;
                
                -- TRY INSERT WITHOUT ON CONFLICT TO SEE RAW ERROR
                INSERT INTO messages (
                    conversation_id, tenant_id, sender_type, content, external_order, external_id
                ) VALUES (
                    v_conversation_id, p_tenant_id, v_role, v_content, v_external_order, 
                    v_call_id || '-' || COALESCE(v_external_order::TEXT, 'msg')
                );
                
                v_inserted_count := v_inserted_count + 1;
            END IF;
        END LOOP;
    END IF;

    RAISE NOTICE '--- END DEBUG ---';

    RETURN jsonb_build_object(
        'success', true, 
        'conversation_id', v_conversation_id, 
        'inserted', v_inserted_count
    );
END;
$$;
