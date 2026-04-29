-- Force cleanup of any conflicting indexes
DROP INDEX IF EXISTS idx_messages_idempotency;
DROP INDEX IF EXISTS idx_messages_external_id_unique;

-- Create the DEFINITIVE unique index
CREATE UNIQUE INDEX idx_messages_tenant_external_id 
ON messages (tenant_id, external_id);

-- Update the RPC to use EXACTLY (tenant_id, external_id)
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
    v_assistant_id VARCHAR;
    v_final_identifier VARCHAR;
    v_final_name VARCHAR;
    v_conversation_id UUID;
    v_agent_id UUID;
    v_status VARCHAR;
    v_ended_reason VARCHAR;
    v_duration INT := 0;
    
    -- Consumption Data
    v_prompt_tokens INT := 0;
    v_completion_tokens INT := 0;
    v_total_tokens INT := 0;
    v_token_cost NUMERIC := 0;
    v_stt_cost NUMERIC := 0;
    v_tts_cost NUMERIC := 0;
    
    -- Message Processing
    v_messages JSONB;
    v_msg JSONB;
    v_role VARCHAR;
    v_content TEXT;
    v_external_order INT;
    v_inserted_count INT := 0;
    
    -- Timestamps
    v_started_at TIMESTAMPTZ;
    v_ended_at TIMESTAMPTZ;
    
    -- Plan Prices
    v_plan_llm_price NUMERIC;
    v_plan_stt_price NUMERIC;
    v_plan_tts_price NUMERIC;
BEGIN
    -- 0. RESOLVE PLAN PRICES
    SELECT 
        COALESCE(p.llm_token_price, 0.10), 
        COALESCE(p.stt_minute_price, 0.05), 
        COALESCE(p.tts_minute_price, 0.05)
    INTO v_plan_llm_price, v_plan_stt_price, v_plan_tts_price
    FROM companies c
    JOIN plans p ON c.plan_tier = p.id
    WHERE c.id = p_tenant_id;
    
    -- Fallback safety
    IF v_plan_llm_price IS NULL THEN
        v_plan_llm_price := 0.10;
        v_plan_stt_price := 0.05;
        v_plan_tts_price := 0.05;
    END IF;

    -- 1. EXTRACT RAW DATA
    v_call_id := p_vapi_payload->'message'->'call'->>'id';
    v_customer_number := p_vapi_payload->'message'->'customer'->>'number';
    v_assistant_id := p_vapi_payload->'message'->'call'->>'assistantId';
    v_messages := p_vapi_payload->'message'->'artifact'->'messages';
    v_status := p_vapi_payload->'message'->'call'->>'status';
    v_ended_reason := p_vapi_payload->'message'->'call'->>'endedReason';
    
    -- 2. FILTER UNANSWERED CALLS
    IF v_ended_reason IN ('no-answer', 'busy', 'failed', 'customer-did-not-answer', 'customer-busy', 'voicemail') THEN
        INSERT INTO integration_logs (tenant_id, provider, external_id, payload, status, error_details)
        VALUES (p_tenant_id, 'vapi', v_call_id, p_vapi_payload, 'ignored', 'Call ended reason: ' || v_ended_reason);
        RETURN jsonb_build_object('success', true, 'status', 'ignored', 'reason', v_ended_reason);
    END IF;

    -- Extract Timestamps for Duration
    BEGIN
        v_started_at := (p_vapi_payload->'message'->'call'->>'startedAt')::TIMESTAMPTZ;
        v_ended_at := (p_vapi_payload->'message'->'call'->>'endedAt')::TIMESTAMPTZ;
        
        IF v_ended_at IS NOT NULL AND v_started_at IS NOT NULL THEN
            v_duration := EXTRACT(EPOCH FROM (v_ended_at - v_started_at))::INT;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_duration := 0;
    END;

    -- Extract Usage
    v_prompt_tokens := COALESCE((p_vapi_payload->'message'->'call'->'usage'->>'promptTokens')::INT, 0);
    v_completion_tokens := COALESCE((p_vapi_payload->'message'->'call'->'usage'->>'completionTokens')::INT, 0);
    v_total_tokens := v_prompt_tokens + v_completion_tokens;

    -- 3. AUDIT LOG
    INSERT INTO integration_logs (
        tenant_id, provider, external_id, payload, status
    ) VALUES (
        p_tenant_id, 'vapi', v_call_id, p_vapi_payload, 'processing'
    ) ON CONFLICT (provider, external_id) DO UPDATE SET status = 'processing';

    -- 4. RESOLVE AGENT
    v_agent_id := (p_vapi_payload->'message'->'assistant'->'metadata'->>'agent_id')::UUID;
    IF v_agent_id IS NULL AND v_assistant_id IS NOT NULL THEN
        SELECT id INTO v_agent_id FROM agents WHERE tenant_id = p_tenant_id AND integration_config->>'vapi_assistant_id' = v_assistant_id LIMIT 1;
    END IF;
    IF v_agent_id IS NULL THEN
        SELECT id INTO v_agent_id FROM agents WHERE tenant_id = p_tenant_id LIMIT 1;
    END IF;

    -- 5. RESOLVE CONTACT IDENTIFIER
    IF p_user_identifier IS NOT NULL AND p_user_identifier != '' THEN
        v_final_identifier := p_user_identifier;
    ELSIF v_customer_number IS NOT NULL AND v_customer_number != '' THEN
        v_final_identifier := v_customer_number;
    ELSE
        v_final_identifier := 'web-visitor-' || v_call_id;
    END IF;
    v_final_name := COALESCE(p_user_name, 'Visitante ' || LEFT(v_call_id, 8));

    -- 6. RESOLVE CONVERSATION & CONTACT SYNC
    SELECT (get_or_create_conversation(
        p_tenant_id,
        v_agent_id,
        v_final_identifier,
        v_final_name,
        jsonb_build_object('vapi_call_id', v_call_id, 'source', 'vapi_sync'),
        v_customer_number
    )->>'id')::UUID INTO v_conversation_id;

    -- Update Duration & Status if ended
    IF v_status = 'ended' THEN
        UPDATE conversations 
        SET duration_seconds = v_duration, status = 'closed', metadata = metadata || jsonb_build_object('vapi_ended_reason', v_ended_reason)
        WHERE id = v_conversation_id;
    END IF;

    -- 7. RECORD CONSUMPTION
    IF v_status = 'ended' THEN
        IF v_total_tokens > 0 THEN
            v_token_cost := (v_total_tokens::NUMERIC / 1000.0) * v_plan_llm_price;
            PERFORM record_usage(v_agent_id::TEXT, 'tokens'::TEXT, v_total_tokens::NUMERIC, v_token_cost, jsonb_build_object('vapi_call_id', v_call_id, 'type', 'llm_sync'));
        END IF;

        IF v_duration > 0 THEN
            v_stt_cost := (v_duration::NUMERIC / 60.0) * v_plan_stt_price;
            PERFORM record_usage(v_agent_id::TEXT, 'stt_minutes'::TEXT, (v_duration::NUMERIC / 60.0), v_stt_cost, jsonb_build_object('vapi_call_id', v_call_id, 'type', 'stt_sync'));
            v_tts_cost := (v_duration::NUMERIC / 60.0) * v_plan_tts_price;
            PERFORM record_usage(v_agent_id::TEXT, 'tts_minutes'::TEXT, (v_duration::NUMERIC / 60.0), v_tts_cost, jsonb_build_object('vapi_call_id', v_call_id, 'type', 'tts_sync'));
        END IF;
    END IF;

    -- 8. SYNC MESSAGES (Idempotent Loop)
    IF v_messages IS NOT NULL AND jsonb_array_length(v_messages) > 0 THEN
        FOR v_msg IN SELECT * FROM jsonb_array_elements(v_messages)
        LOOP
            v_role := v_msg->>'role';
            v_content := v_msg->>'message';
            v_external_order := (v_msg->>'order')::INT;
            
            IF v_role IN ('user', 'bot', 'assistant') THEN
                IF v_role = 'bot' OR v_role = 'assistant' THEN v_role := 'ai'; END IF;
                
                BEGIN
                    INSERT INTO messages (
                        conversation_id, tenant_id, sender_type, content, external_order, external_id, metadata
                    ) VALUES (
                        v_conversation_id, p_tenant_id, v_role, v_content, v_external_order, 
                        v_call_id || '-' || COALESCE(v_external_order::TEXT, 'msg'), v_msg
                    )
                    -- Matches index: idx_messages_tenant_external_id (tenant_id, external_id)
                    ON CONFLICT (tenant_id, external_id) DO NOTHING;
                    
                    IF FOUND THEN
                        v_inserted_count := v_inserted_count + 1;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    RAISE NOTICE 'Skipped message %', v_external_order;
                END;
            END IF;
        END LOOP;
    END IF;

    -- 9. AUDIT SUCCESS
    UPDATE integration_logs 
    SET status = 'success', 
        error_details = 'Inserted: ' || v_inserted_count || ' | Tokens: ' || v_total_tokens 
    WHERE provider = 'vapi' AND external_id = v_call_id;

    RETURN jsonb_build_object(
        'success', true, 
        'conversation_id', v_conversation_id, 
        'new_messages', v_inserted_count, 
        'total_tokens', v_total_tokens,
        'call_status', v_status
    );

EXCEPTION WHEN OTHERS THEN
    UPDATE integration_logs SET status = 'error', error_details = SQLERRM WHERE provider = 'vapi' AND external_id = v_call_id;
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
