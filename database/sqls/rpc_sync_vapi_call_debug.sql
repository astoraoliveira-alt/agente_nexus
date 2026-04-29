-- RPC: sync_vapi_call (DEBUG VERSION)
-- Includes RAISE NOTICE to trace execution flow.

CREATE OR REPLACE FUNCTION sync_vapi_call(
    p_tenant_id UUID,
    p_vapi_payload JSONB,
    p_user_identifier VARCHAR DEFAULT NULL, -- Optional overriders from N8N
    p_user_name VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_call_id VARCHAR;
    v_customer_number VARCHAR;
    v_final_identifier VARCHAR;
    v_final_name VARCHAR;
    v_conversation_id UUID;
    v_agent_id UUID;
    v_status VARCHAR;
    v_ended_reason VARCHAR;
    v_duration INT := 0;
    
    v_messages JSONB;
    v_msg JSONB;
    v_role VARCHAR;
    v_content TEXT;
    v_idx INT := 0;
    v_inserted_count INT := 0;
    
    v_started_at TIMESTAMPTZ;
    v_ended_at TIMESTAMPTZ;
BEGIN
    RAISE NOTICE '--- START DEBUG SYNC VAPI ---';
    RAISE NOTICE 'Tenant: %', p_tenant_id;

    -- 1. EXTRACT RAW DATA
    v_call_id := p_vapi_payload->'message'->'call'->>'id';
    v_customer_number := p_vapi_payload->'message'->'customer'->>'number';
    
    -- DEBUG: Check extraction
    RAISE NOTICE 'Call ID: %', v_call_id;
    
    -- FIX: Ensure we use -> for array extraction
    v_messages := p_vapi_payload->'message'->'artifact'->'messages';
    
    RAISE NOTICE 'Messages JSON Type: %', jsonb_typeof(v_messages);
    RAISE NOTICE 'Messages Content: %', v_messages;
    
    v_status := p_vapi_payload->'message'->'call'->>'status';
    v_ended_reason := p_vapi_payload->'message'->'call'->>'endedReason';
    
    -- ... Duration logic ...

    -- 2. AUDIT LOG
    INSERT INTO integration_logs (
        tenant_id, provider, external_id, payload, status
    ) VALUES (
        p_tenant_id, 'vapi', v_call_id, p_vapi_payload, 'processing'
    );

    -- 3. RESOLVE CONTACT
    IF p_user_identifier IS NOT NULL AND p_user_identifier != '' THEN
        v_final_identifier := p_user_identifier;
    ELSIF v_customer_number IS NOT NULL AND v_customer_number != '' THEN
        v_final_identifier := v_customer_number;
    ELSE
        v_final_identifier := 'web-visitor-' || v_call_id;
    END IF;
    
    v_final_name := COALESCE(p_user_name, 'Visitante ' || LEFT(v_call_id, 8));
    RAISE NOTICE 'Resolved Identifier: %', v_final_identifier;

    -- 4. RESOLVE CONVERSATION
    SELECT id INTO v_conversation_id
    FROM conversations
    WHERE metadata->>'vapi_call_id' = v_call_id
    LIMIT 1;

    IF v_conversation_id IS NULL THEN
        RAISE NOTICE 'Conversation not found, creating new...';
        
        -- Get Agent ID
        SELECT id INTO v_agent_id FROM agents WHERE tenant_id = p_tenant_id LIMIT 1;
        RAISE NOTICE 'Selected Agent ID: %', v_agent_id;
        
        IF v_agent_id IS NULL THEN
             RAISE EXCEPTION 'NO AGENT FOUND FOR TENANT. CANNOT CREATE CONVERSATION.';
        END IF;
        
        -- Create/Get
        SELECT (get_or_create_conversation(
            p_tenant_id,
            v_agent_id,
            v_final_identifier,
            v_final_name,
            jsonb_build_object('vapi_call_id', v_call_id, 'source', 'vapi_sync')
        )->>'id')::UUID INTO v_conversation_id;
    END IF;
    
    RAISE NOTICE 'Conversation ID: %', v_conversation_id;

    -- Update Duration & Status if ended
    IF v_status = 'ended' THEN
        UPDATE conversations 
        SET duration_seconds = v_duration,
            status = 'closed'
        WHERE id = v_conversation_id;
    END IF;

    -- 5. SYNC MESSAGES
    IF v_messages IS NOT NULL AND jsonb_array_length(v_messages) > 0 THEN
        RAISE NOTICE 'Starting Message Loop. Count: %', jsonb_array_length(v_messages);
        
        FOR v_msg IN SELECT * FROM jsonb_array_elements(v_messages)
        LOOP
            v_role := v_msg->>'role';
            v_content := v_msg->>'message';
            
            RAISE NOTICE 'Processing Msg: Role=%, Content=%', v_role, left(v_content, 20);
            
            IF v_role IN ('user', 'bot', 'assistant') THEN
                IF v_role = 'bot' OR v_role = 'assistant' THEN v_role := 'ai'; END IF;
                IF v_role = 'user' THEN v_role := 'user'; END IF;
                
                v_idx := v_idx + 1;
                
                BEGIN
                    INSERT INTO messages (
                        conversation_id, tenant_id, sender_type, content, 
                        external_order, external_id, metadata
                    ) VALUES (
                        v_conversation_id, p_tenant_id, v_role, v_content, 
                        v_idx, v_call_id || '-' || v_idx, v_msg
                    )
                    ON CONFLICT (conversation_id, external_order) DO NOTHING;
                    
                    IF FOUND THEN
                        v_inserted_count := v_inserted_count + 1;
                        RAISE NOTICE 'Inserted Message #%', v_idx;
                    ELSE
                        RAISE NOTICE 'Duplicate Message #% (Ignored)', v_idx;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    RAISE NOTICE 'ERROR Inserting Message %: %', v_idx, SQLERRM;
                END;
            ELSE
                 RAISE NOTICE 'Skipping Role: %', v_role;
            END IF;
        END LOOP;
    ELSE
        RAISE NOTICE 'No Messages to process.';
    END IF;

    -- 6. AUDIT SUCCESS
    UPDATE integration_logs 
    SET status = 'success', error_details = 'Inserted: ' || v_inserted_count 
    WHERE provider = 'vapi' AND external_id = v_call_id;

    RETURN jsonb_build_object(
        'success', true,
        'conversation_id', v_conversation_id,
        'new_messages', v_inserted_count,
        'total_duration', v_duration,
        'call_status', v_status
    );

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'CRITICAL ERROR: %', SQLERRM;
    UPDATE integration_logs 
    SET status = 'error', error_details = SQLERRM 
    WHERE provider = 'vapi' AND external_id = v_call_id;
    
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
