-- TEST SCRIPT: Verifying sync_vapi_call Logic
-- Run this block in Supabase SQL Editor to validate the entire flow.

DO $$
DECLARE
    v_tenant_id UUID;
    v_result JSONB;
    v_payload JSONB;
    v_conversation_id UUID;
BEGIN
    -- 1. Get First Tenant (For testing)
    SELECT id INTO v_tenant_id FROM companies LIMIT 1;
    
    IF v_tenant_id IS NULL THEN
        RAISE NOTICE 'No Tenant Found. Create a company first.';
        RETURN;
    END IF;

    RAISE NOTICE 'Testing with Tenant ID: %', v_tenant_id;

    -- 1.1 ENSURE AGENT EXISTS (Crucial for get_or_create_conversation)
    IF NOT EXISTS (SELECT 1 FROM agents WHERE tenant_id = v_tenant_id) THEN
        RAISE NOTICE 'No Agent found. Seeding dummy agent...';
        INSERT INTO agents (tenant_id, name, type, status)
        VALUES (v_tenant_id, 'Agent VAPI Test', 'conversational', 'active');
    END IF;

    -- 2. Construct Mock VAPI Payload (Initial Call)
    v_payload := '{
      "message": {
        "call": {
          "id": "test-call-unique-12345",
          "status": "active",
          "startedAt": "2024-01-01T10:00:00Z"
        },
        "customer": {
          "number": "+5511999999999"
        },
        "artifact": {
          "messages": [
            { "role": "bot", "message": "Olá, sou a Sofia." },
            { "role": "user", "message": "Quero crédito." }
          ]
        }
      }
    }'::jsonb;

    -- 3. EXECUTE FIRST SYNC (Simulating N8N)
    -- We pass explicit user details to test priority
    v_result := sync_vapi_call(
        v_tenant_id,
        v_payload,
        '+5511999999999', -- p_user_identifier (Explicit from N8N)
        'Teste VAPI User'  -- p_user_name (Explicit from N8N)
    );

    v_conversation_id := (v_result->>'conversation_id')::UUID;
    
    RAISE NOTICE 'First Sync Result: %', v_result;
    
    -- VALIDATION 1: Messages Created? should be 2.
    PERFORM 1 FROM messages WHERE conversation_id = v_conversation_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Validation Failed: Messages NOT created.'; END IF;

    -- 4. EXECUTE IDEMPOTENCY CHECK (Same Payload)
    v_result := sync_vapi_call(
        v_tenant_id,
        v_payload,
        '+5511999999999', 
        'Teste VAPI User'
    );
    
    RAISE NOTICE 'Idempotency Sync Result: %', v_result;
    
    -- VALIDATION 2: New messages should be 0.
    IF (v_result->>'new_messages')::INT != 0 THEN
        RAISE EXCEPTION 'Validation Failed: Idempotency failed. Duplicate messages inserted.';
    END IF;

    -- 5. EXECUTE INCREMENTAL SYNC (New Message Added)
    v_payload := '{
      "message": {
        "call": {
          "id": "test-call-unique-12345",
          "status": "ended", 
          "endedReason": "completed",
          "startedAt": "2024-01-01T10:00:00Z",
          "endedAt": "2024-01-01T10:02:00Z" 
        },
        "customer": {
          "number": "+5511999999999"
        },
        "artifact": {
          "messages": [
            { "role": "bot", "message": "Olá, sou a Sofia." },
            { "role": "user", "message": "Quero crédito." },
            { "role": "bot", "message": "Entendido. Aprovado!" } 
          ]
        }
      }
    }'::jsonb;
    
    v_result := sync_vapi_call(
        v_tenant_id,
        v_payload,
        '+5511999999999', 
        'Teste VAPI User'
    );
    
    RAISE NOTICE 'Incremental Sync Result: %', v_result;

    -- VALIDATION 3: New messages should be 1. Status should be closed. Duration captured.
    IF (v_result->>'new_messages')::INT != 1 THEN
         RAISE EXCEPTION 'Validation Failed: Incremental sync failed. Expected 1 new message.';
    END IF;
    
    IF (v_result->>'call_status') != 'ended' THEN
         RAISE EXCEPTION 'Validation Failed: Status update failed.';
    END IF;

    IF (v_result->>'total_duration')::INT != 120 THEN
         RAISE EXCEPTION 'Validation Failed: Duration calculation failed. Expected 120s.';
    END IF;

    RAISE NOTICE '✅ ALL TESTS PASSED SUCCESSFULLY!';
END $$;
