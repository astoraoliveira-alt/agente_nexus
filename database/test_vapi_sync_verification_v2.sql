-- TEST SCRIPT V2: Enhanced Debugging
-- Run this in Supabase SQL Editor.

DO $$
DECLARE
    v_tenant_id UUID;
    v_agent_id UUID;
    v_result JSONB;
    v_payload JSONB;
    v_conversation_id UUID;
    v_log_error TEXT;
    v_call_id TEXT := 'test-call-debug-001';
BEGIN
    RAISE NOTICE '--- STARTING V2 VERIFICATION ---';

    -- 1. GET OR CREATE TENANT
    SELECT id INTO v_tenant_id FROM companies LIMIT 1;
    IF v_tenant_id IS NULL THEN
        RAISE NOTICE 'Creating generic company...';
        INSERT INTO companies (name, slug, status) VALUES ('Debug Co', 'debug-co', 'active') RETURNING id INTO v_tenant_id;
    END IF;
    RAISE NOTICE 'Tenant ID: %', v_tenant_id;

    -- 2. GET OR CREATE AGENT (Mandatory)
    SELECT id INTO v_agent_id FROM agents WHERE tenant_id = v_tenant_id LIMIT 1;
    IF v_agent_id IS NULL THEN
        RAISE NOTICE 'Creating generic agent...';
        INSERT INTO agents (tenant_id, name, type, status) 
        VALUES (v_tenant_id, 'Debug Agent', 'conversational', 'active') 
        RETURNING id INTO v_agent_id;
    END IF;
    RAISE NOTICE 'Agent ID: %', v_agent_id;

    -- 3. PAYLOAD
    v_payload := jsonb_build_object(
        'message', jsonb_build_object(
            'call', jsonb_build_object(
                'id', v_call_id,
                'status', 'active',
                'startedAt', '2024-01-01T10:00:00Z'
            ),
            'customer', jsonb_build_object(
                'number', '+5511988887777'
            ),
            'artifact', jsonb_build_object(
                'messages', jsonb_build_array(
                    jsonb_build_object('role', 'bot', 'message', 'Hello World'),
                    jsonb_build_object('role', 'user', 'message', 'Debug me')
                )
            )
        )
    );

    -- 4. EXECUTE RPC
    RAISE NOTICE 'Executing sync_vapi_call...';
    
    v_result := sync_vapi_call(
        v_tenant_id,
        v_payload,
        '+5511988887777',
        'Debug User'
    );

    RAISE NOTICE 'RPC Result: %', v_result;

    -- 5. ANALYZE FAILURE
    IF (v_result->>'success')::BOOLEAN IS NOT TRUE THEN
        RAISE NOTICE '❌ RPC FAILED!';
        RAISE NOTICE 'Error from JSON: %', v_result->>'error';
        
        -- Check Logic Logs
        SELECT error_details INTO v_log_error 
        FROM integration_logs 
        WHERE external_id = v_call_id 
        ORDER BY processed_at DESC LIMIT 1;
        
        RAISE NOTICE 'Log Table details: %', v_log_error;
        RETURN; -- Stop here
    END IF;

    -- 6. ANALYZE MESSAGES
    v_conversation_id := (v_result->>'conversation_id')::UUID;
    IF v_conversation_id IS NULL THEN
        RAISE NOTICE '❌ Conversation ID is NULL even though success=true';
        RETURN;
    END IF;

    PERFORM 1 FROM messages WHERE conversation_id = v_conversation_id;
    IF NOT FOUND THEN
        RAISE NOTICE '❌ Validated Failed: No messages found in table "messages" for conversation %', v_conversation_id;
        
        -- Check if loop ran but failed insert
        -- Check Log again
        SELECT error_details INTO v_log_error 
        FROM integration_logs 
        WHERE external_id = v_call_id;
        RAISE NOTICE 'Log Details (Success?): %', v_log_error;
    ELSE
        RAISE NOTICE '✅ SUCCESS: Messages found!';
    END IF;

END $$;
