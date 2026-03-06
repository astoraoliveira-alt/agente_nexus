CREATE OR REPLACE FUNCTION sync_vapi_call(
    p_tenant_id UUID,
    p_vapi_payload JSONB,
    p_user_identifier VARCHAR DEFAULT NULL,
    p_user_name VARCHAR DEFAULT NULL,
    p_agent_id UUID DEFAULT NULL
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
    v_cost_breakdown JSONB;
    
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
    v_lead_id UUID;
    v_is_campaign_call BOOLEAN := FALSE;
    
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
    v_final_debug_text TEXT;
    
    -- Timestamps
    v_started_at TIMESTAMPTZ;
    v_ended_at TIMESTAMPTZ;
    
    -- Plan Prices
    v_plan_llm_price NUMERIC;
    v_plan_stt_price NUMERIC;
    v_plan_tts_price NUMERIC;
    
    -- Generic Fields
    v_platform_cost NUMERIC;
    v_platform_cost_breakdown JSONB;
    v_recording_url TEXT;
    v_stereo_url TEXT;
BEGIN
    -- 0. RESOLVE PLAN PRICES
    BEGIN
        SELECT 
            COALESCE(p.llm_token_price, 0.10), 
            COALESCE(p.stt_minute_price, 0.05), 
            COALESCE(p.tts_minute_price, 0.05)
        INTO v_plan_llm_price, v_plan_stt_price, v_plan_tts_price
        FROM companies c
        JOIN plans p ON c.plan_tier = p.id
        WHERE c.id = p_tenant_id;
    EXCEPTION WHEN OTHERS THEN 
        v_plan_llm_price := 0.10;
        v_plan_stt_price := 0.05;
        v_plan_tts_price := 0.05;
    END;
    
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
    
    -- If it's an end of call report but missing explicit status, assume 'ended'
    IF v_status IS NULL AND COALESCE(v_message_obj->>'type', p_vapi_payload->>'type') = 'end-of-call-report' THEN
        v_status := 'ended';
    END IF;
    v_messages := v_artifact_obj->'messages';
    
    -- Generic Cost/Breakdown and Recordings
    v_platform_cost := COALESCE((v_message_obj->>'cost')::NUMERIC, (v_call_obj->>'cost')::NUMERIC, 0);
    v_platform_cost_breakdown := COALESCE(v_message_obj->'costBreakdown', v_call_obj->'costBreakdown');
    v_recording_url := COALESCE(v_artifact_obj->>'recordingUrl', v_message_obj->>'recordingUrl', v_call_obj->>'recordingUrl');
    v_stereo_url := COALESCE(v_artifact_obj->>'stereoRecordingUrl', v_message_obj->>'stereoRecordingUrl', v_call_obj->>'stereoRecordingUrl');

    -- Extract Timestamps and Duration
    BEGIN
        v_duration := COALESCE(
             (v_message_obj->>'durationSeconds')::NUMERIC::INT, 
             (v_call_obj->>'durationSeconds')::NUMERIC::INT,
             0
        );

        IF v_duration = 0 THEN
             v_started_at := COALESCE((v_message_obj->>'startedAt')::TIMESTAMPTZ, (v_call_obj->>'startedAt')::TIMESTAMPTZ);
             v_ended_at := COALESCE((v_message_obj->>'endedAt')::TIMESTAMPTZ, (v_call_obj->>'endedAt')::TIMESTAMPTZ);
             IF v_ended_at IS NOT NULL AND v_started_at IS NOT NULL THEN
                 v_duration := EXTRACT(EPOCH FROM (v_ended_at - v_started_at))::INT;
             END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN v_duration := 0; END;

    -- BUILD DEBUG INFO
    v_debug_info := jsonb_build_object(
        'payload_keys', (SELECT jsonb_object_keys(p_vapi_payload) LIMIT 5),
        'call_id', v_call_id,
        'status', v_status
    );

    -- =============================================
    -- 2. FINAL AGENT RESOLUTION
    -- =============================================
    IF p_agent_id IS NOT NULL THEN
        v_agent_id := p_agent_id;
    ELSE
        -- 2.1 Try Server Headers sent by Vapi to N8N
        v_agent_id := COALESCE(
            (v_assistant_obj->'server'->'headers'->>'agent_id')::UUID,
            (v_call_obj->'assistant'->'server'->'headers'->>'agent_id')::UUID,
            (v_message_obj->'call'->'assistant'->'server'->'headers'->>'agent_id')::UUID
        );
        -- 2.2 Try Metadata
        IF v_agent_id IS NULL THEN
            v_agent_id := (v_assistant_obj->'metadata'->>'agent_id')::UUID;
        END IF;
        -- 2.3 Try VAPI Assistant ID DB Mapping
        IF v_agent_id IS NULL AND v_assistant_id IS NOT NULL THEN
            SELECT id INTO v_agent_id FROM agents WHERE tenant_id = p_tenant_id AND integration_config->>'vapi_assistant_id' = v_assistant_id LIMIT 1;
        END IF;
        -- 2.4 Fallback: First Agent
        IF v_agent_id IS NULL THEN
            SELECT id INTO v_agent_id FROM agents WHERE tenant_id = p_tenant_id LIMIT 1;
        END IF;
    END IF;

    -- =============================================
    -- 3. RESOLVE CONTACT IDENTIFIER
    -- =============================================
    IF p_user_identifier IS NOT NULL AND p_user_identifier != '' THEN
        v_final_identifier := regexp_replace(p_user_identifier, '[^0-9]', '', 'g'); -- Strip non-digits
        IF v_final_identifier = '' THEN v_final_identifier := p_user_identifier; END IF;
    ELSIF v_customer_number IS NOT NULL AND v_customer_number != '' THEN
        v_final_identifier := regexp_replace(v_customer_number, '[^0-9]', '', 'g'); -- Strip non-digits
    ELSE
        v_final_identifier := 'web-visitor-' || v_call_id;
    END IF;
    
    v_final_name := COALESCE(p_user_name, 'Visitante ' || LEFT(v_call_id, 8));


    -- =============================================
    -- 4. SMART OUTBOUND CAMPAIGN DETECTION
    -- =============================================
    -- Option A: Explicit leadId in metadata
    BEGIN
        v_lead_id := (v_call_obj->'metadata'->>'leadId')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_lead_id := NULL;
        v_skipped_reasons := array_append(v_skipped_reasons, 'Failed to parse explicit leadId to UUID');
    END;
    
    -- Option B: Auto-detect by phone + tenant in pending outbound_queue
    IF v_lead_id IS NULL AND v_final_identifier != '' THEN
        BEGIN
            SELECT id INTO v_lead_id
            FROM outbound_queue
            WHERE tenant_id = p_tenant_id
              AND status IN ('pending', 'processing')
              AND RIGHT(regexp_replace(contact_phone, '[^0-9]', '', 'g'), 10) = RIGHT(v_final_identifier, 10)
            ORDER BY created_at DESC
            LIMIT 1;
        EXCEPTION WHEN OTHERS THEN
            v_lead_id := NULL;
        END;
    END IF;

    IF v_lead_id IS NOT NULL THEN
        v_is_campaign_call := TRUE;
    END IF;

    -- Update debug info to capture the found lead
    v_debug_info := v_debug_info || jsonb_build_object(
        'campaign_detected', v_is_campaign_call,
        'detected_lead_id', v_lead_id
    );

    -- =============================================
    -- 5. ABORTED CALLS & CAMPAIGN FAILED/SENT
    -- =============================================
    -- Se nao atendeu, deu ocupado, ou durou muito pouco (customer-ended-call < 10s)
    IF v_ended_reason IN ('no-answer', 'busy', 'failed', 'customer-did-not-answer', 'customer-busy', 'voicemail') 
       OR (v_ended_reason = 'customer-ended-call' AND v_duration < 10 AND v_is_campaign_call = TRUE) THEN
        
        -- Atualizar Fila de Disparo (Campaigns) como FAILED
        IF v_is_campaign_call = TRUE THEN
            BEGIN
                UPDATE outbound_queue 
                SET status = 'failed', 
                    error_message = 'Call ended (' || v_ended_reason || ') within ' || v_duration || 's.'
                WHERE id = v_lead_id;
            EXCEPTION WHEN OTHERS THEN
                v_skipped_reasons := array_append(v_skipped_reasons, 'Failed to update queue: ' || SQLERRM);
            END;
        END IF;
       
        -- INSTEAD OF RETURNING EARLY, JUST LOG AND PROCEED.
        -- If we return early, n8n fails downstream because it expects conversation_id to be returned.
        -- By proceeding, we create a valid conversation log (even if it's 2 seconds long)
        -- so n8n can attach the AI summary and the CRM accurately reflects a failed dial attempt.
        v_debug_info := v_debug_info || jsonb_build_object('short_or_aborted_call', true, 'reason_aborted', v_ended_reason);
        
    ELSIF v_is_campaign_call = TRUE AND v_status IN ('ended', 'completed') THEN
        -- CAMPAIGN SUCCESS DETECTION (If made it past the failed filters)
        BEGIN
            UPDATE outbound_queue 
            SET status = 'sent',
                response_detected = true
            WHERE id = v_lead_id;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;


    -- Extract Usage (Safe Path without nested exceptions breaking flow)
    BEGIN
        v_cost_breakdown := COALESCE(v_message_obj->'costBreakdown', v_call_obj->'costBreakdown');
        
        -- Try to extract direct usage tokens first
        v_prompt_tokens := COALESCE((v_call_obj->'usage'->>'promptTokens')::INT, 0);
        v_completion_tokens := COALESCE((v_call_obj->'usage'->>'completionTokens')::INT, 0);
        
        -- If 0, fallback to costBreakdown which might be nested differently based on provider
        IF v_prompt_tokens = 0 AND v_cost_breakdown IS NOT NULL THEN
            IF jsonb_typeof(v_cost_breakdown->'llm') = 'object' THEN
                v_prompt_tokens := COALESCE((v_cost_breakdown->'llm'->>'promptTokens')::INT, 0);
                v_completion_tokens := COALESCE((v_cost_breakdown->'llm'->>'completionTokens')::INT, 0);
            ELSE
                v_prompt_tokens := COALESCE((v_cost_breakdown->>'llmPromptTokens')::INT, 0);
                v_completion_tokens := COALESCE((v_cost_breakdown->>'llmCompletionTokens')::INT, 0);
            END IF;
        END IF;

        v_total_tokens := v_prompt_tokens + v_completion_tokens;
    EXCEPTION WHEN OTHERS THEN
        v_skipped_reasons := array_append(v_skipped_reasons, 'Usage Extract Syntax Error: ' || SQLERRM);
        v_prompt_tokens := 0;
        v_completion_tokens := 0;
        v_total_tokens := 0;
    END;

    -- AUDIT LOG (UPSERT)
    BEGIN
        INSERT INTO integration_logs (
            tenant_id, provider, external_id, payload, status
        ) VALUES (
            p_tenant_id, 'vapi', v_call_id, p_vapi_payload, 'processing'
        ) 
        ON CONFLICT ON CONSTRAINT uq_integration_logs_provider_external_id 
        DO UPDATE SET status = 'processing';
    EXCEPTION WHEN OTHERS THEN 
        v_skipped_reasons := array_append(v_skipped_reasons, 'Log Upsert Error: ' || SQLERRM);
    END;

    -- =============================================
    -- 6. RESOLVE CONVERSATION & CONTACT META
    -- =============================================
    BEGIN
        SELECT (get_or_create_conversation(
            p_tenant_id,
            v_agent_id,
            v_final_identifier,
            v_final_name,
            jsonb_build_object('vapi_call_id', v_call_id, 'source', 'vapi_sync'),
            v_customer_number
        )->>'id')::UUID INTO v_conversation_id;
    EXCEPTION WHEN OTHERS THEN
        v_skipped_reasons := array_append(v_skipped_reasons, 'Conversation create error: ' || SQLERRM);
        UPDATE integration_logs SET status = 'error', error_details = 'Failed to create conversation: ' || SQLERRM || ' | Agent: ' || COALESCE(v_agent_id::TEXT, 'null') WHERE provider = 'vapi' AND external_id = v_call_id;
        RETURN jsonb_build_object('success', false, 'error', 'Error in get_or_create_conversation', 'details', SQLERRM);
    END;

    -- Update Duration, Status & Metadata (Generic Cost Tracking)
    -- We record this even if the call was 2 seconds long as an explicit audit log.
    IF v_status IN ('ended', 'queued', 'ringing', 'in-progress') THEN
        BEGIN
            UPDATE conversations 
            SET duration_seconds = v_duration, 
                status = 'closed'::conversation_status, 
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
                    'platform_ended_reason', v_ended_reason,
                    'platform_cost', v_platform_cost,
                    'platform_cost_breakdown', v_platform_cost_breakdown,
                    'lead_id', v_lead_id
                ))
            WHERE id = v_conversation_id;
        EXCEPTION WHEN OTHERS THEN
            v_skipped_reasons := array_append(v_skipped_reasons, 'Conversation update error: ' || SQLERRM);
        END;
    END IF;

    -- 6.1 RECORD NATIVE ARTIFACTS
    IF v_recording_url IS NOT NULL THEN
        BEGIN
            INSERT INTO conversation_artifacts (
                tenant_id,
                conversation_id,
                agent_id,
                platform,
                file_type,
                external_url,
                metadata
            ) VALUES (
                p_tenant_id,
                v_conversation_id,
                v_agent_id,
                'vapi',
                'audio',
                v_recording_url,
                jsonb_strip_nulls(jsonb_build_object(
                    'stereo_url', v_stereo_url,
                    'vapi_call_id', v_call_id
                ))
            );
        EXCEPTION WHEN OTHERS THEN 
            v_skipped_reasons := array_append(v_skipped_reasons, 'Artifact insert error: ' || SQLERRM);
        END;
    END IF;

    -- =============================================
    -- 7. RECORD CONSUMPTION
    -- =============================================
    IF v_status IN ('ended', 'queued', 'in-progress') THEN
        BEGIN
            -- TOKENS
            IF v_total_tokens > 0 THEN
                v_token_cost := (v_total_tokens::NUMERIC / 1000.0) * v_plan_llm_price;
                INSERT INTO consumption_metrics (tenant_id, agent_id, channel, metric_type, value, cost, metadata) 
                VALUES (p_tenant_id, v_agent_id, 'voice'::conversation_channel, 'tokens'::metric_type, v_total_tokens::NUMERIC, v_token_cost, jsonb_build_object('vapi_call_id', v_call_id, 'type', 'llm_sync'))
                ON CONFLICT DO NOTHING;
            END IF;

            -- MINUTES (STT / TTS)
            IF v_duration > 0 THEN
                v_stt_cost := (v_duration::NUMERIC / 60.0) * v_plan_stt_price;
                INSERT INTO consumption_metrics (tenant_id, agent_id, channel, metric_type, value, cost, metadata) 
                VALUES (p_tenant_id, v_agent_id, 'voice'::conversation_channel, 'stt_minutes'::metric_type, (v_duration::NUMERIC / 60.0), v_stt_cost, jsonb_build_object('vapi_call_id', v_call_id, 'type', 'stt_sync'))
                ON CONFLICT DO NOTHING;

                v_tts_cost := (v_duration::NUMERIC / 60.0) * v_plan_tts_price;
                INSERT INTO consumption_metrics (tenant_id, agent_id, channel, metric_type, value, cost, metadata) 
                VALUES (p_tenant_id, v_agent_id, 'voice'::conversation_channel, 'tts_minutes'::metric_type, (v_duration::NUMERIC / 60.0), v_tts_cost, jsonb_build_object('vapi_call_id', v_call_id, 'type', 'tts_sync'))
                ON CONFLICT DO NOTHING;
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            v_skipped_reasons := array_append(v_skipped_reasons, 'Consumption block failed completely: ' || SQLERRM);
        END;
    END IF;

    -- =============================================
    -- 8. SYNC MESSAGES
    -- =============================================
    IF v_messages IS NOT NULL AND jsonb_array_length(v_messages) > 0 THEN
        v_loop_index := 0; 
        FOR v_msg IN SELECT * FROM jsonb_array_elements(v_messages)
        LOOP
            v_loop_index := v_loop_index + 1;
            
            v_raw_role := v_msg->>'role';
            v_role := LOWER(v_raw_role);
            v_content := v_msg->>'message';
            v_external_order := COALESCE((v_msg->>'order')::INT, v_loop_index);
            
            IF v_role IN ('tool_calls', 'tool_call_result', 'system') THEN
                CONTINUE;
            END IF;

            IF v_role IN ('user', 'bot', 'assistant', 'function') THEN
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
                    v_skipped_reasons := array_append(v_skipped_reasons, 'Insert Msg Error (' || v_external_order || '): ' || SQLERRM);
                END;
            ELSE
                v_skipped_reasons := array_append(v_skipped_reasons, 'Invalid Role: ' || COALESCE(v_raw_role, 'NULL'));
            END IF;
        END LOOP;
    END IF;

    -- Final Debug Object Construction
    v_debug_info := v_debug_info || jsonb_build_object(
        'skipped_reasons', v_skipped_reasons,
        'messages_processed_count', v_loop_index,
        'messages_inserted_count', v_inserted_count,
        'agent_resolved', v_agent_id,
        'final_identifier', v_final_identifier,
        'duration', v_duration
    );

    -- 9. AUDIT SUCCESS (Attach skipped reasons to UI logs)
    BEGIN
        v_final_debug_text := 'Inserted: ' || v_inserted_count || ' | Tokens: ' || v_total_tokens;
        IF COALESCE(array_length(v_skipped_reasons, 1), 0) > 0 THEN
            v_final_debug_text := v_final_debug_text || ' | Skipped errors: ' || array_to_string(v_skipped_reasons, ' ; ');
        END IF;

        UPDATE integration_logs 
        SET status = 'success', 
            error_details = v_final_debug_text 
        WHERE provider = 'vapi' AND external_id = v_call_id;
    EXCEPTION WHEN OTHERS THEN NULL; END;

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
        UPDATE integration_logs SET status = 'error', error_details = SQLERRM WHERE provider = 'vapi' AND external_id = COALESCE(v_call_id, 'unknown');
    EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'debug', COALESCE(v_debug_info, '{}'::jsonb));
END;
$$;
-- =============================================
-- FIX: Contact Creation for VAPI / Voice channels
-- Purpose: Ensures the v_agent_type is correctly mapped to conversation_channel Enum 
--          so it doesn't fail silently and skip CRM contact creation.
-- =============================================

CREATE OR REPLACE FUNCTION get_or_create_conversation(
    p_tenant_id UUID,
    p_agent_id UUID,
    p_user_identifier VARCHAR,
    p_user_name VARCHAR,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_phone VARCHAR DEFAULT NULL,
    p_email VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_conversation_id UUID;
    v_status VARCHAR;
    v_agent_type VARCHAR;
    v_channel VARCHAR;
BEGIN
    -- 0. Get Agent Type to determine channel
    SELECT COALESCE(type, 'text') INTO v_agent_type FROM agents WHERE id = p_agent_id;
    
    -- Map agent type and metadata to valid conversation_channel enum values ('text', 'voice', 'whatsapp')
    IF p_metadata->>'source' = 'vapi_sync' OR p_metadata->>'vapi_call_id' IS NOT NULL THEN
        v_channel := 'voice';
    ELSIF v_agent_type = 'whatsapp' THEN
        v_channel := 'whatsapp';
    ELSIF v_agent_type IN ('vapi', 'voice', 'call') THEN
        v_channel := 'voice';
    ELSE
        v_channel := 'text';
    END IF;

    -- 1. Find LATEST Conversation
    SELECT id, status INTO v_conversation_id, v_status
    FROM conversations
    WHERE tenant_id = p_tenant_id
      AND agent_id = p_agent_id
      AND user_identifier = p_user_identifier
    ORDER BY created_at DESC
    LIMIT 1;

    -- 2. Logic Flow for Conversation
    IF v_conversation_id IS NULL THEN
        INSERT INTO conversations (
            tenant_id, agent_id, user_identifier, user_name, channel, status, metadata
        )
        VALUES (
            p_tenant_id, p_agent_id, p_user_identifier, p_user_name, v_channel::conversation_channel, 'ai_active', p_metadata
        )
        RETURNING id INTO v_conversation_id;
    ELSIF v_status = 'closed' THEN
        UPDATE conversations 
        SET status = 'ai_active',
            metadata = COALESCE(metadata, '{}'::jsonb) || p_metadata,
            user_name = p_user_name,
            last_message_at = NOW()
        WHERE id = v_conversation_id;
    ELSE
        UPDATE conversations 
        SET metadata = COALESCE(metadata, '{}'::jsonb) || p_metadata,
            user_name = p_user_name,
            last_message_at = NOW()
        WHERE id = v_conversation_id;
    END IF;

    -- 3. Sync Contact (CRM) - Scoped to tenant_id
    -- GUARD: Only sync if user is explicitly identified or from whatsapp/voice
    IF (p_user_name != '??' OR p_phone IS NOT NULL OR p_email IS NOT NULL OR v_channel IN ('whatsapp', 'voice')) THEN
        BEGIN
            INSERT INTO contacts (
                tenant_id,
                identifier,
                name,
                phone,
                email,
                channel,
                extra_info,
                lifecycle_status
            )
            VALUES (
                p_tenant_id,
                p_user_identifier,
                p_user_name,
                COALESCE(p_phone, CASE WHEN v_channel IN ('whatsapp', 'voice') THEN p_user_identifier ELSE NULL END),
                p_email,
                v_channel::conversation_channel, -- FIX: Use correctly mapped v_channel instead of raw v_agent_type
                p_metadata,
                'lead'
            )
            ON CONFLICT (tenant_id, identifier) DO UPDATE
            SET name = EXCLUDED.name,
                phone = COALESCE(EXCLUDED.phone, contacts.phone),
                email = COALESCE(EXCLUDED.email, contacts.email),
                channel = EXCLUDED.channel,
                extra_info = contacts.extra_info || EXCLUDED.extra_info,
                updated_at = NOW();
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Erro ao sincronizar contato: %', SQLERRM;
        END;
    END IF;

    -- Return result
    RETURN jsonb_build_object('id', v_conversation_id, 'reopened', (COALESCE(v_status, '') = 'closed'));
END;
$$;
-- Cleaning up any duplicate signatures to avoid ambiguity
DROP FUNCTION IF EXISTS record_usage(TEXT, TEXT, NUMERIC, NUMERIC, JSONB, TEXT);
DROP FUNCTION IF EXISTS record_usage(UUID, TEXT, TEXT, NUMERIC, NUMERIC, JSONB);
DROP FUNCTION IF EXISTS record_usage(TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB);
DROP FUNCTION IF EXISTS record_usage(UUID, UUID, TEXT, NUMERIC, NUMERIC, JSONB);
-- =========================================================
-- PATCH: Restore missing consumption_metrics for old calls
-- =========================================================
INSERT INTO consumption_metrics (
    tenant_id, agent_id, channel, metric_type, value, cost, recorded_at, metadata
)
SELECT 
    tenant_id,
    COALESCE(
        (payload->'message'->'call'->'assistant'->'server'->'headers'->>'agent_id')::UUID,
        (payload->'message'->'assistant'->'server'->'headers'->>'agent_id')::UUID,
        (SELECT id FROM agents WHERE tenant_id = integration_logs.tenant_id LIMIT 1)
    ) as agent_id,
    'voice'::conversation_channel,
    'stt_minutes'::metric_type,
    ((payload->'message'->>'durationSeconds')::NUMERIC / 60.0) as value,
    0 as cost, -- approximate
    processed_at,
    jsonb_build_object('vapi_call_id', external_id, 'type', 'stt_sync_restored')
FROM integration_logs
WHERE provider = 'vapi' AND status = 'success'
  AND (payload->'message'->>'durationSeconds') IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM consumption_metrics cm 
      WHERE cm.metadata->>'vapi_call_id' = integration_logs.external_id 
        AND cm.metric_type = 'stt_minutes'
  );

INSERT INTO consumption_metrics (
    tenant_id, agent_id, channel, metric_type, value, cost, recorded_at, metadata
)
SELECT 
    tenant_id,
    COALESCE(
        (payload->'message'->'call'->'assistant'->'server'->'headers'->>'agent_id')::UUID,
        (payload->'message'->'assistant'->'server'->'headers'->>'agent_id')::UUID,
        (SELECT id FROM agents WHERE tenant_id = integration_logs.tenant_id LIMIT 1)
    ) as agent_id,
    'voice'::conversation_channel,
    'tts_minutes'::metric_type,
    ((payload->'message'->>'durationSeconds')::NUMERIC / 60.0) as value,
    0 as cost, -- approximate
    processed_at,
    jsonb_build_object('vapi_call_id', external_id, 'type', 'tts_sync_restored')
FROM integration_logs
WHERE provider = 'vapi' AND status = 'success'
  AND (payload->'message'->>'durationSeconds') IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM consumption_metrics cm 
      WHERE cm.metadata->>'vapi_call_id' = integration_logs.external_id 
        AND cm.metric_type = 'tts_minutes'
  );

INSERT INTO consumption_metrics (
    tenant_id, agent_id, channel, metric_type, value, cost, recorded_at, metadata
)
SELECT 
    tenant_id,
    COALESCE(
        (payload->'message'->'call'->'assistant'->'server'->'headers'->>'agent_id')::UUID,
        (payload->'message'->'assistant'->'server'->'headers'->>'agent_id')::UUID,
        (SELECT id FROM agents WHERE tenant_id = integration_logs.tenant_id LIMIT 1)
    ) as agent_id,
    'voice'::conversation_channel,
    'tokens'::metric_type,
    COALESCE((payload->'message'->'costBreakdown'->>'llmPromptTokens')::NUMERIC, 0) + COALESCE((payload->'message'->'costBreakdown'->>'llmCompletionTokens')::NUMERIC, 0) as value,
    0 as cost, -- approximate
    processed_at,
    jsonb_build_object('vapi_call_id', external_id, 'type', 'llm_sync_restored')
FROM integration_logs
WHERE provider = 'vapi' AND status = 'success'
  AND payload->'message'->'costBreakdown' IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM consumption_metrics cm 
      WHERE cm.metadata->>'vapi_call_id' = integration_logs.external_id 
        AND cm.metric_type = 'tokens'
  );
-- =============================================
-- FIX: get_conversation_transcript (Order and JSON Cleansing)
-- Description: Ensures messages are sorted by created_at AND external_order
-- to prevent scrambled transcripts when messages are inserted in batches (VAPI).
-- =============================================

CREATE OR REPLACE FUNCTION get_conversation_transcript(p_conversation_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transcript TEXT := '';
    r RECORD;
    v_exists BOOLEAN;
    v_clean_content TEXT;
BEGIN
    -- 0. Null Safety on Input
    IF p_conversation_id IS NULL THEN
        RETURN 'ERROR: Conversation ID is NULL';
    END IF;

    -- 1. Check if conversation exists
    SELECT EXISTS(SELECT 1 FROM conversations WHERE id = p_conversation_id) INTO v_exists;
    
    IF NOT v_exists THEN
        RETURN format('ERROR: Conversation ID %s not found in database.', p_conversation_id);
    END IF;

    -- 2. Build Transcript
    -- We use created_at ASC and external_order ASC to ensure strict chronological order
    FOR r IN 
        SELECT 
            created_at,
            sender_type,
            COALESCE(content, '[MEDIA/AUDIO]') as content,
            external_order
        FROM messages 
        WHERE conversation_id = p_conversation_id 
        ORDER BY created_at ASC, COALESCE(external_order, 0) ASC
    LOOP
        -- Clean the content (remove JSON artifacts if helper exists)
        BEGIN
            v_clean_content := public.clean_message_content(r.content);
        EXCEPTION WHEN OTHERS THEN
            v_clean_content := r.content;
        END;
    
        v_transcript := v_transcript || 
                        '[' || COALESCE(to_char(r.created_at, 'DD/MM HH24:MI'), '??:??') || '] ' || 
                        UPPER(COALESCE(r.sender_type, 'UNKNOWN')) || ': ' || 
                        COALESCE(v_clean_content, '') || E'\n';
    END LOOP;
    
    -- 3. Handle Empty Transcript
    IF v_transcript IS NULL OR v_transcript = '' THEN
        RETURN 'WARNING: Transcript is empty (0 messages found).';
    END IF;
    
    RETURN v_transcript;
END;
$$;

GRANT EXECUTE ON FUNCTION get_conversation_transcript(UUID) TO postgres, anon, authenticated, service_role;
-- =============================================
-- FIX: get_financial_report (Revenue and Consistency)
-- Description: Corrects message charging logic to avoid double counting
-- and ensures it aligns with the 0.50 STT / 0.50 TTS billing strategy.
-- =============================================

CREATE OR REPLACE FUNCTION get_financial_report(
    p_month INT,
    p_year INT
)
RETURNS TABLE (
    tenant_id UUID,
    company_name TEXT,
    plan_name TEXT,
    revenue_fixed NUMERIC,
    revenue_variable NUMERIC,
    cost_fixed NUMERIC,
    cost_variable_llm NUMERIC,
    cost_variable_voice NUMERIC,
    cost_variable_other NUMERIC,
    net_margin NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_date TIMESTAMP WITH TIME ZONE;
    v_end_date TIMESTAMP WITH TIME ZONE;
BEGIN
    v_start_date := make_timestamptz(p_year, p_month, 1, 0, 0, 0);
    v_end_date := v_start_date + INTERVAL '1 month';

    RETURN QUERY
    WITH revenue_metrics AS (
        SELECT 
            cm.tenant_id,
            COALESCE(SUM(CASE WHEN cm.metric_type = 'tokens' THEN cm.value ELSE 0 END), 0) as val_llm,
            COALESCE(SUM(CASE WHEN cm.metric_type = 'stt_minutes' THEN cm.value ELSE 0 END), 0) as val_stt,
            COALESCE(SUM(CASE WHEN cm.metric_type = 'tts_minutes' THEN cm.value ELSE 0 END), 0) as val_tts,
            COALESCE(SUM(CASE WHEN cm.metric_type = 'messages' THEN cm.value ELSE 0 END), 0) as val_msgs_recorded
        FROM consumption_metrics cm
        WHERE cm.recorded_at >= v_start_date AND cm.recorded_at < v_end_date
        GROUP BY cm.tenant_id
    ),
    message_counts AS (
        SELECT 
            m.tenant_id,
            COUNT(*) as total_msgs
        FROM messages m
        WHERE m.created_at >= v_start_date AND m.created_at < v_end_date
        GROUP BY m.tenant_id
    ),
    tenant_fixed_costs AS (
        SELECT 
            cdc.tenant_id,
            COALESCE(SUM(CASE WHEN cdc.is_recurring = TRUE THEN cdc.cost_value ELSE 0 END), 0) as total_fixed_cost
        FROM company_davos_costs cdc
        GROUP BY cdc.tenant_id
    ),
    tenant_rates AS (
        SELECT 
            cdc.tenant_id,
            MAX(CASE WHEN cdc.item_key = 'llm_internal_rate' THEN cdc.cost_value ELSE 0 END) as llm_rate,
            MAX(CASE WHEN cdc.item_key = 'voice_internal_rate' THEN cdc.cost_value ELSE 0 END) as voice_rate,
            MAX(CASE WHEN cdc.item_key = 'twilio_variable' THEN cdc.cost_value ELSE 0 END) as twilio_var_rate,
            MAX(CASE WHEN cdc.item_key = 'msg_whatsapp' THEN cdc.cost_value ELSE 0 END) as whatsapp_rate
        FROM company_davos_costs cdc
        GROUP BY cdc.tenant_id
    ),
    raw_calculations AS (
        SELECT 
            c.id as raw_tenant_id,
            c.name::TEXT as raw_company_name,
            p.name::TEXT as raw_plan_name,
            COALESCE(p.base_price, 0)::NUMERIC as raw_revenue_fixed,
            COALESCE(p.monthly_fee_covers_usage, FALSE) as raw_monthly_fee_covers_usage,
            (
                (COALESCE(rm.val_llm, 0) / 1000.0 * COALESCE(p.llm_token_price, 0)) + 
                (COALESCE(rm.val_stt, 0) * COALESCE(p.stt_minute_price, 0)) + 
                (COALESCE(rm.val_tts, 0) * COALESCE(p.tts_minute_price, 0)) +
                (COALESCE(rm.val_msgs_recorded, 0) * COALESCE(p.message_price, 0)) +
                (COALESCE(mc.total_msgs, 0) * COALESCE(p.message_price, 0))
            ) as raw_revenue_variable,
            COALESCE(tfc.total_fixed_cost, 0) as raw_cost_fixed,
            ((COALESCE(rm.val_llm, 0) / 1000.0) * COALESCE(tr.llm_rate, 0.05)) as raw_cost_variable_llm,
            -- FIX: Voice cost uses GREATEST(stt, tts) for call minutes, avoiding double counting
            (GREATEST(COALESCE(rm.val_stt, 0), COALESCE(rm.val_tts, 0)) * COALESCE(tr.voice_rate, 0.15)) as raw_cost_variable_voice,
            -- Other variable costs like Twilio also per call minute
            (GREATEST(COALESCE(rm.val_stt, 0), COALESCE(rm.val_tts, 0)) * COALESCE(tr.twilio_var_rate, 0)) as raw_cost_variable_other_voice,
            ((COALESCE(rm.val_msgs_recorded, 0) + COALESCE(mc.total_msgs, 0)) * COALESCE(tr.whatsapp_rate, 0.05)) as raw_cost_variable_whatsapp
        FROM companies c
        LEFT JOIN plans p ON c.plan_tier = p.id
        LEFT JOIN revenue_metrics rm ON c.id = rm.tenant_id
        LEFT JOIN message_counts mc ON c.id = mc.tenant_id
        LEFT JOIN tenant_fixed_costs tfc ON c.id = tfc.tenant_id
        LEFT JOIN tenant_rates tr ON c.id = tr.tenant_id
    )
    SELECT 
        raw_tenant_id as tenant_id,
        raw_company_name as company_name,
        raw_plan_name as plan_name,
        raw_revenue_fixed as revenue_fixed,
        ROUND((
            CASE 
                WHEN raw_monthly_fee_covers_usage THEN GREATEST(0, raw_revenue_variable - raw_revenue_fixed)
                ELSE raw_revenue_variable 
            END
        ), 2)::NUMERIC as revenue_variable,
        ROUND(raw_cost_fixed, 2)::NUMERIC as cost_fixed,
        ROUND(raw_cost_variable_llm, 2)::NUMERIC as cost_variable_llm,
        ROUND(raw_cost_variable_voice, 2)::NUMERIC as cost_variable_voice,
        ROUND(raw_cost_variable_other_voice + raw_cost_variable_whatsapp, 2)::NUMERIC as cost_variable_other,
        ROUND((
            raw_revenue_fixed + 
            CASE 
                WHEN raw_monthly_fee_covers_usage THEN GREATEST(0, raw_revenue_variable - raw_revenue_fixed)
                ELSE raw_revenue_variable 
            END
        ) - (
            raw_cost_fixed + raw_cost_variable_llm + raw_cost_variable_voice + raw_cost_variable_other_voice + raw_cost_variable_whatsapp
        ), 2)::NUMERIC as net_margin
    FROM raw_calculations
    ORDER BY net_margin DESC;
END;
$$;
-- =============================================
-- FIX: get_companies_overview (Syntax and Casing)
-- Description: Fixes missing FROM clause and ensures camelCase 
-- for easier consumption in React frontend.
-- =============================================

DROP FUNCTION IF EXISTS get_companies_overview();

CREATE OR REPLACE FUNCTION get_companies_overview()
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    slug VARCHAR,
    status VARCHAR,
    plan_tier VARCHAR,
    created_at TIMESTAMPTZ,
    privacy_settings JSONB,
    plan_details JSONB,
    agents_count BIGINT,
    users_count BIGINT,
    total_tokens NUMERIC,
    total_messages BIGINT,
    plan_prices JSONB,
    plan_name VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.name::VARCHAR,
        c.slug::VARCHAR,
        c.status::VARCHAR,
        c.plan_tier::VARCHAR,
        c.created_at,
        c.privacy_settings,
        c.plan_details,
        (SELECT COUNT(*) FROM agents a WHERE a.tenant_id = c.id) as agents_count,
        (SELECT COUNT(*) FROM users u WHERE u.tenant_id = c.id) as users_count,
        COALESCE((
            SELECT SUM(cm.value) 
            FROM consumption_metrics cm 
            WHERE cm.tenant_id = c.id 
            AND cm.metric_type = 'tokens'
        ), 0) as total_tokens,
        COALESCE((
            SELECT COUNT(*) 
            FROM messages m 
            WHERE m.tenant_id = c.id
        ), 0) as total_messages,
        (
            SELECT jsonb_build_object(
                'basePrice', p.base_price,
                'llmTokenPrice', p.llm_token_price,
                'messagePrice', p.message_price,
                'sttMinutePrice', p.stt_minute_price,
                'ttsMinutePrice', p.tts_minute_price
            )
            FROM plans p
            WHERE p.id = c.plan_tier
            LIMIT 1
        ) as plan_prices,
        (SELECT p.name::VARCHAR FROM plans p WHERE p.id = c.plan_tier) as plan_name
    FROM companies c
    ORDER BY c.name;
END;
$$;

-- Ensure Davos plan is set correctly to 0.50/0.50
UPDATE plans SET 
    stt_minute_price = 0.50, 
    tts_minute_price = 0.50 
WHERE id = 'plan-unlimited';
