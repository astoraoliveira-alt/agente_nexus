-- RPC: sync_vapi_call (PRODUCTION FINAL)
-- Optimized version without verbose DEBUG logs.

CREATE OR REPLACE FUNCTION sync_vapi_call(
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
    -- 1. EXTRACT RAW DATA
    v_call_id := p_vapi_payload->'message'->'call'->>'id';
    v_customer_number := p_vapi_payload->'message'->'customer'->>'number';
    v_messages := p_vapi_payload->'message'->'artifact'->'messages'; -- Fixed Operator
    v_status := p_vapi_payload->'message'->'call'->>'status';
    v_ended_reason := p_vapi_payload->'message'->'call'->>'endedReason';
    
    BEGIN
        v_started_at := (p_vapi_payload->'message'->'call'->>'startedAt')::TIMESTAMPTZ;
        v_ended_at := (p_vapi_payload->'message'->'call'->>'endedAt')::TIMESTAMPTZ;
        IF v_ended_at IS NOT NULL AND v_started_at IS NOT NULL THEN
            v_duration := EXTRACT(EPOCH FROM (v_ended_at - v_started_at))::INT;
        END IF;
    EXCEPTION WHEN OTHERS THEN v_duration := 0; END;

    -- 2. AUDIT LOG
    INSERT INTO integration_logs (tenant_id, provider, external_id, payload, status) 
    VALUES (p_tenant_id, 'vapi', v_call_id, p_vapi_payload, 'processing');

    -- 3. RESOLVE CONTACT
    IF p_user_identifier IS NOT NULL AND p_user_identifier != '' THEN v_final_identifier := p_user_identifier;
    ELSIF v_customer_number IS NOT NULL AND v_customer_number != '' THEN v_final_identifier := v_customer_number;
    ELSE v_final_identifier := 'web-visitor-' || v_call_id; END IF;
    
    v_final_name := COALESCE(p_user_name, 'Visitante ' || LEFT(v_call_id, 8));

    -- 4. RESOLVE CONVERSATION
    SELECT id INTO v_conversation_id FROM conversations WHERE metadata->>'vapi_call_id' = v_call_id LIMIT 1;

    IF v_conversation_id IS NULL THEN
        SELECT id INTO v_agent_id FROM agents WHERE tenant_id = p_tenant_id LIMIT 1;
        IF v_agent_id IS NULL THEN RAISE EXCEPTION 'No Agent found for Tenant'; END IF;
        
        SELECT (get_or_create_conversation(
            p_tenant_id, v_agent_id, v_final_identifier, v_final_name,
            jsonb_build_object('vapi_call_id', v_call_id, 'source', 'vapi_sync')
        )->>'id')::UUID INTO v_conversation_id;
    END IF;

    IF v_status = 'ended' THEN
        UPDATE conversations SET duration_seconds = v_duration, status = 'closed', metadata = metadata || jsonb_build_object('vapi_ended_reason', v_ended_reason) WHERE id = v_conversation_id;
    END IF;

    -- 5. SYNC MESSAGES
    IF v_messages IS NOT NULL AND jsonb_array_length(v_messages) > 0 THEN
        FOR v_msg IN SELECT * FROM jsonb_array_elements(v_messages) LOOP
            v_role := v_msg->>'role';
            v_content := v_msg->>'message';
            
            IF v_role IN ('user', 'bot', 'assistant') THEN
                IF v_role = 'bot' OR v_role = 'assistant' THEN v_role := 'ai'; END IF;
                IF v_role = 'user' THEN v_role := 'user'; END IF;
                v_idx := v_idx + 1;
                
                BEGIN
                    INSERT INTO messages (conversation_id, tenant_id, sender_type, content, external_order, external_id, metadata) 
                    VALUES (v_conversation_id, p_tenant_id, v_role, v_content, v_idx, v_call_id || '-' || v_idx, v_msg)
                    ON CONFLICT (conversation_id, external_order) DO NOTHING;
                    IF FOUND THEN v_inserted_count := v_inserted_count + 1; END IF;
                EXCEPTION WHEN OTHERS THEN NULL; END;
            END IF;
        END LOOP;
    END IF;

    UPDATE integration_logs SET status = 'success', error_details = 'Inserted: ' || v_inserted_count WHERE provider = 'vapi' AND external_id = v_call_id;

    RETURN jsonb_build_object('success', true, 'conversation_id', v_conversation_id, 'new_messages', v_inserted_count, 'total_duration', v_duration, 'call_status', v_status);

EXCEPTION WHEN OTHERS THEN
    UPDATE integration_logs SET status = 'error', error_details = SQLERRM WHERE provider = 'vapi' AND external_id = v_call_id;
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
