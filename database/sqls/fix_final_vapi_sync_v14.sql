-- FIX V14: Filter System Prompts & Fix Token Usage
-- Purpose: 
-- 1. Ignore 'system' role messages (e.g. "You are Sofia...") so they don't appear in chat.
-- 2. Improve token usage extraction (try 'analysis' object fallback).

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
    -- Extracted Object Wrappers
    v_message_obj JSONB;
    v_call_obj JSONB;
    v_artifact_obj JSONB;
    v_customer_obj JSONB;
    v_assistant_obj JSONB;
    v_analysis_obj JSONB;
    
    -- Final Variables
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
    v_raw_role VARCHAR;
    v_content TEXT;
    v_external_order INT;
    v_loop_index INT := 0; 
    v_inserted_count INT := 0;
    
    -- Debugging
    v_debug_info JSONB;
    v_skipped_reasons TEXT[] := ARRAY[]::TEXT[];
    
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
    
    IF v_plan_llm_price IS NULL THEN
        v_plan_llm_price := 0.10;
        v_plan_stt_price := 0.05;
        v_plan_tts_price := 0.05;
    END IF;

    -- =============================================
    -- 1. HYBRID EXTRACTION STRATEGY
    -- =============================================
    v_message_obj := p_vapi_payload->'message';
    v_call_obj := COALESCE(v_message_obj->'call', p_vapi_payload->'call', p_vapi_payload);
    v_customer_obj := COALESCE(v_message_obj->'customer', p_vapi_payload->'customer', v_call_obj->'customer');
    v_assistant_obj := COALESCE(v_message_obj->'assistant', p_vapi_payload->'assistant', v_call_obj->'assistant');
    v_artifact_obj := COALESCE(v_message_obj->'artifact', p_vapi_payload->'artifact', v_call_obj->'artifact');
    v_analysis_obj := COALESCE(v_message_obj->'analysis', p_vapi_payload->'analysis', v_call_obj->'analysis');

    -- NOW EXTRACT FIELDS
    v_call_id := COALESCE(v_call_obj->>'id', v_message_obj->>'id'); 
    v_customer_number := v_customer_obj->>'number';
    v_assistant_id := COALESCE(v_call_obj->>'assistantId', v_assistant_obj->>'id');
    v_status := COALESCE(v_message_obj->>'status', v_call_obj->>'status');
    v_ended_reason := COALESCE(v_message_obj->>'endedReason', v_call_obj->>'endedReason');
    v_messages := v_artifact_obj->'messages';

    -- BUILD DEBUG INFO
    v_debug_info := jsonb_build_object(
        'payload_keys', (SELECT jsonb_object_keys(p_vapi_payload) LIMIT 5),
        'call_id', v_call_id,
        'status', v_status
    );

    IF v_ended_reason IN ('no-answer', 'busy', 'failed', 'customer-did-not-answer', 'customer-busy', 'voicemail') THEN
        INSERT INTO integration_logs (tenant_id, provider, external_id, payload, status, error_details)
        VALUES (p_tenant_id, 'vapi', v_call_id, p_vapi_payload, 'ignored', 'Call ended reason: ' || v_ended_reason);
        RETURN jsonb_build_object('success', true, 'status', 'ignored', 'reason', v_ended_reason);
    END IF;

    -- Extract Timestamps for Duration
    BEGIN
        v_started_at := (v_call_obj->>'startedAt')::TIMESTAMPTZ;
        v_ended_at := (v_call_obj->>'endedAt')::TIMESTAMPTZ;
        IF v_ended_at IS NOT NULL AND v_started_at IS NOT NULL THEN
            v_duration := EXTRACT(EPOCH FROM (v_ended_at - v_started_at))::INT;
        END IF;
    EXCEPTION WHEN OTHERS THEN v_duration := 0; END;

    -- Extract Usage (Enhanced Path)
    -- Try call.usage OR call.costBreakdown.llm OR payload.usage
    v_prompt_tokens := COALESCE(
        (v_call_obj->'usage'->>'promptTokens')::INT, 
        (v_call_obj->'costBreakdown'->'llm'->>'promptTokens')::INT,
        0
    );
    v_completion_tokens := COALESCE(
        (v_call_obj->'usage'->>'completionTokens')::INT, 
        (v_call_obj->'costBreakdown'->'llm'->>'completionTokens')::INT,
        0
    );
    v_total_tokens := v_prompt_tokens + v_completion_tokens;

    -- 3. AUDIT LOG (UPSERT)
    INSERT INTO integration_logs (
        tenant_id, provider, external_id, payload, status
    ) VALUES (
        p_tenant_id, 'vapi', v_call_id, p_vapi_payload, 'processing'
    ) 
    ON CONFLICT ON CONSTRAINT uq_integration_logs_provider_external_id 
    DO UPDATE SET status = 'processing';

    -- 4. RESOLVE AGENT
    v_agent_id := (v_assistant_obj->'metadata'->>'agent_id')::UUID;
    IF v_agent_id IS NULL AND v_assistant_id IS NOT NULL THEN
        SELECT id INTO v_agent_id FROM agents WHERE tenant_id = p_tenant_id AND integration_config->>'vapi_assistant_id' = v_assistant_id LIMIT 1;
    END IF;
    IF v_agent_id IS NULL THEN
        SELECT id INTO v_agent_id FROM agents WHERE tenant_id = p_tenant_id LIMIT 1;
    END IF;

    -- 5. RESOLVE CONTACT IDENTIFIER (Hybrid)
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

    -- Update Duration & Status
    IF v_status IN ('ended', 'queued', 'ringing', 'in-progress') THEN
        UPDATE conversations 
        SET duration_seconds = v_duration, 
            status = (CASE WHEN v_status = 'ended' THEN 'closed' ELSE 'ai_active' END)::conversation_status, 
            metadata = metadata || jsonb_build_object('vapi_ended_reason', v_ended_reason)
        WHERE id = v_conversation_id;
    END IF;

    -- 7. RECORD CONSUMPTION
    IF v_status IN ('ended', 'queued', 'in-progress') THEN
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

    -- 8. SYNC MESSAGES
    IF v_messages IS NOT NULL AND jsonb_array_length(v_messages) > 0 THEN
        v_loop_index := 0; 
        FOR v_msg IN SELECT * FROM jsonb_array_elements(v_messages)
        LOOP
            v_loop_index := v_loop_index + 1;
            
            v_raw_role := v_msg->>'role';
            -- Normalize Role to Lowercase for check
            v_role := LOWER(v_raw_role);
            v_content := v_msg->>'message';
            v_external_order := COALESCE((v_msg->>'order')::INT, v_loop_index);
            
            -- Ignore Tool Calls AND System Prompts
            IF v_role IN ('tool_calls', 'tool_call_result', 'system') THEN
                CONTINUE;
            END IF;

            IF v_role IN ('user', 'bot', 'assistant', 'function') THEN
                
                -- Map VAPI roles to Agent Nexus roles (ai, user)
                IF v_role IN ('bot', 'assistant', 'function') THEN 
                    v_role := 'ai'; 
                ELSIF v_role = 'user' THEN
                    v_role := 'user';
                END IF;
                
                BEGIN
                    INSERT INTO messages (
                        conversation_id, tenant_id, sender_type, content, external_order, external_id, metadata
                    ) VALUES (
                        v_conversation_id, p_tenant_id, v_role, v_content, v_external_order, 
                        v_call_id || '-' || v_external_order::TEXT, 
                        v_msg
                    )
                    ON CONFLICT ON CONSTRAINT uq_messages_tenant_external_id DO NOTHING;
                    
                    IF FOUND THEN
                        v_inserted_count := v_inserted_count + 1;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    v_skipped_reasons := array_append(v_skipped_reasons, 'Insert Error (' || v_external_order || '): ' || SQLERRM);
                    RAISE NOTICE 'Skipped message %: %', v_external_order, SQLERRM;
                END;
            ELSE
                v_skipped_reasons := array_append(v_skipped_reasons, 'Invalid Role: ' || COALESCE(v_raw_role, 'NULL'));
            END IF;
        END LOOP;
    END IF;

    -- 9. AUDIT SUCCESS
    UPDATE integration_logs 
    SET status = 'success', 
        error_details = 'Inserted: ' || v_inserted_count || ' | Tokens: ' || v_total_tokens 
    WHERE provider = 'vapi' AND external_id = v_call_id;

    -- Final Debug Object
    v_debug_info := v_debug_info || jsonb_build_object(
        'skipped_reasons', v_skipped_reasons,
        'messages_processed_count', v_loop_index,
        'messages_inserted_count', v_inserted_count
    );

    RETURN jsonb_build_object(
        'success', true, 
        'conversation_id', v_conversation_id, 
        'new_messages', v_inserted_count, 
        'total_tokens', v_total_tokens,
        'call_status', v_status,
        'debug', v_debug_info
    );

EXCEPTION WHEN OTHERS THEN
    BEGIN
        UPDATE integration_logs SET status = 'error', error_details = SQLERRM WHERE provider = 'vapi' AND external_id = v_call_id;
    EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
