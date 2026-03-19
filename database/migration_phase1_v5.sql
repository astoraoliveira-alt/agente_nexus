
-- ============================================================================
-- NEXUS HUB ARCHITECTURE v3.0 - PHASE 1: CORE OPTIMIZATION
-- Purpose: Unified Orchestrator, Persistent Identity Sessions, and RAG Fusion
-- ============================================================================

-- 1. Refactor Security Sessions Table for Identity Persistence
-- We move from conversation-based sessions to user-identifier based sessions
ALTER TABLE public.conversation_security_sessions 
ADD COLUMN IF NOT EXISTS user_identifier TEXT,
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.companies(id);

-- Migration of existing data identifier (best effort)
UPDATE public.conversation_security_sessions s
SET tenant_id = c.tenant_id,
    user_identifier = c.user_identifier
FROM public.conversations c
WHERE s.conversation_id = c.id
  AND s.user_identifier IS NULL;

-- Update constraint to be identifier-based
ALTER TABLE public.conversation_security_sessions DROP CONSTRAINT IF EXISTS conversation_security_sessions_conversation_id_agent_id_key;
ALTER TABLE public.conversation_security_sessions DROP CONSTRAINT IF EXISTS uq_session_identity;
ALTER TABLE public.conversation_security_sessions ADD CONSTRAINT uq_session_identity UNIQUE (tenant_id, user_identifier, agent_id);

-- Make conversation_id nullable as it's now optional (allows cross-convo persistence)
ALTER TABLE public.conversation_security_sessions ALTER COLUMN conversation_id DROP NOT NULL;

-- 2. Master Orchestrator RPC v5 (The "Single Shot" Engine)
CREATE OR REPLACE FUNCTION orchestrate_ai_conversation_v5(
    p_instance_name TEXT,
    p_user_identifier TEXT,
    p_user_name TEXT,
    p_user_message TEXT,
    p_message_embedding VECTOR(1536) DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_agent_id UUID;
    v_tenant_id UUID;
    v_agent_name TEXT;
    v_agent_status VARCHAR;
    v_company_status VARCHAR;
    v_max_concurrency INT;
    v_active_conv_count INT;
    v_conversation_id UUID;
    v_reopened BOOLEAN := FALSE;
    v_agent_config JSONB;
    v_integration_config JSONB;
    v_history JSONB;
    v_knowledge JSONB;
    v_memories JSONB;
    v_lifecycle_stage VARCHAR;
    v_autonomy_level INT;
    v_context_window INT;
    v_applied_policies TEXT[];
    
    -- Security / Identity
    v_session RECORD;
    v_identity_gate JSONB;
    v_cumulative_risk_score NUMERIC := 0.0;
    v_is_blocked BOOLEAN := FALSE;
    v_security_response JSONB;
    
    -- Governance
    v_governance_rules JSONB;
    v_found_policy_names TEXT[];
    
    v_clean_identifier TEXT;
BEGIN
    -- Sanitização do identificador
    v_clean_identifier := split_part(p_user_identifier, '@', 1);

    -- 1. Lookup Agent & Tenant
    SELECT 
        id, tenant_id, name, status, max_concurrency, brain_config, 
        lifecycle_stage::VARCHAR, autonomy_level, context_window, 
        applied_policies, integration_config
    INTO 
        v_agent_id, v_tenant_id, v_agent_name, v_agent_status, v_max_concurrency, v_agent_config, 
        v_lifecycle_stage, v_autonomy_level, v_context_window, 
        v_applied_policies, v_integration_config
    FROM agents
    WHERE evolution_instance = p_instance_name
    LIMIT 1;

    -- Basic Validations
    IF v_agent_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Agent not found for instance: ' || p_instance_name);
    END IF;

    SELECT status INTO v_company_status FROM companies WHERE id = v_tenant_id;
    IF v_company_status != 'active' THEN
        RETURN jsonb_build_object('status', 'blocked', 'reason', 'Company suspended or inactive');
    END IF;

    -- 2. Cumulative Risk Score (ISO 42001 logic)
    -- Calculate weight of active incidents for this user in the last 24h
    SELECT COALESCE(SUM(
        CASE 
            WHEN severity = 'critical' THEN 3.0
            WHEN severity = 'high' THEN 1.0
            WHEN severity = 'medium' THEN 0.3
            ELSE 0.0
        END
    ), 0.0) INTO v_cumulative_risk_score
    FROM incidents
    WHERE tenant_id = v_tenant_id
      AND (conversation_id IN (SELECT id FROM conversations WHERE user_identifier = v_clean_identifier)
           OR reported_by IN (SELECT id FROM users WHERE email = v_clean_identifier)) -- Identifier could be email or phone
      AND status != 'resolved'
      AND created_at >= NOW() - INTERVAL '24 hours';

    -- 3. Identity Gate Evaluation
    v_identity_gate := v_agent_config->'capabilities'->'identity_gate';
    
    -- Lookup Session (Global Identity)
    SELECT * INTO v_session
    FROM conversation_security_sessions
    WHERE tenant_id = v_tenant_id 
      AND user_identifier = v_clean_identifier 
      AND agent_id = v_agent_id;

    -- Lazy Expiry
    IF v_session.expires_at IS NOT NULL AND v_session.expires_at < NOW() AND v_session.status = 'active' THEN
        UPDATE conversation_security_sessions SET status = 'expired', updated_at = NOW() WHERE id = v_session.id;
        v_session.status := 'expired';
    END IF;

    -- Security Block Logic (Based on cumulative score or session status)
    IF v_cumulative_risk_score >= 3.0 THEN
        v_is_blocked := TRUE;
    END IF;

    v_security_response := jsonb_build_object(
        'session_status', COALESCE(v_session.status::TEXT, 'unauthenticated'),
        'cumulative_risk_score', v_cumulative_risk_score,
        'is_blocked_by_governance', v_is_blocked,
        'identity_gate_enabled', COALESCE((v_identity_gate->>'enabled')::BOOLEAN, FALSE),
        'validated_identifier', v_session.validated_identifier,
        'protected_intents', COALESCE(v_identity_gate->'protected_intents', '[]'::jsonb)
    );

    -- 4. Set/Update Conversation
    SELECT id, status INTO v_conversation_id, v_agent_status
    FROM conversations
    WHERE tenant_id = v_tenant_id
      AND agent_id = v_agent_id
      AND user_identifier = v_clean_identifier
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_conversation_id IS NULL THEN
        INSERT INTO conversations (tenant_id, agent_id, user_identifier, user_name, channel, status, metadata)
        VALUES (v_tenant_id, v_agent_id, v_clean_identifier, p_user_name, 'whatsapp', 'ai_active', p_metadata)
        RETURNING id INTO v_conversation_id;
    ELSE
        UPDATE conversations 
        SET status = 'ai_active', 
            last_message_at = NOW(), 
            user_name = p_user_name 
        WHERE id = v_conversation_id;
        IF v_agent_status = 'closed' THEN v_reopened := TRUE; END IF;
    END IF;

    -- 5. Context Fusion (History + RAG)
    -- History
    SELECT jsonb_agg(sub) INTO v_history
    FROM (
        SELECT sender_type, content, message_type, created_at
        FROM messages
        WHERE conversation_id = v_conversation_id
        ORDER BY created_at DESC
        LIMIT COALESCE(v_context_window, 10)
    ) sub;

    -- RAG: Knowledge (Only if embedding provided)
    IF p_message_embedding IS NOT NULL THEN
        SELECT jsonb_agg(sub.content) INTO v_knowledge
        FROM (
            SELECT content
            FROM agent_knowledge
            WHERE agent_id = v_agent_id
            ORDER BY embedding <=> p_message_embedding
            LIMIT 5
        ) sub;

        -- RAG: Success Memory
        SELECT jsonb_agg(sub.strategic_summary) INTO v_memories
        FROM (
            SELECT strategic_summary
            FROM agent_success_memory
            WHERE agent_id = v_agent_id
            ORDER BY embedding <=> p_message_embedding
            LIMIT 3
        ) sub;
    ELSE
        -- Fallback to static knowledge lookup if no embedding (lite mode)
        SELECT jsonb_agg(content) INTO v_knowledge
        FROM agent_knowledge
        WHERE agent_id = v_agent_id
        LIMIT 3;
    END IF;

    -- 6. Governance Rules Aggregation
    IF v_applied_policies IS NOT NULL AND array_length(v_applied_policies, 1) > 0 THEN
        SELECT 
            jsonb_build_object(
                'canDo', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM policies p2, jsonb_array_elements_text(p2.rules->'canDo') r WHERE p2.tenant_id = v_tenant_id AND p2.is_active = TRUE AND (p2.id::TEXT = ANY(v_applied_policies) OR p2.name = ANY(v_applied_policies))), '[]'::jsonb),
                'cannotDo', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM policies p2, jsonb_array_elements_text(p2.rules->'cannotDo') r WHERE p2.tenant_id = v_tenant_id AND p2.is_active = TRUE AND (p2.id::TEXT = ANY(v_applied_policies) OR p2.name = ANY(v_applied_policies))), '[]'::jsonb),
                'transferConditions', COALESCE((SELECT jsonb_agg(DISTINCT r) FROM policies p2, jsonb_array_elements_text(p2.rules->'transferConditions') r WHERE p2.tenant_id = v_tenant_id AND p2.is_active = TRUE AND (p2.id::TEXT = ANY(v_applied_policies) OR p2.name = ANY(v_applied_policies))), '[]'::jsonb)
            )
        INTO v_governance_rules;
    ELSE
        v_governance_rules := '{"canDo": [], "cannotDo": [], "transferConditions": []}'::jsonb;
    END IF;

    -- 7. Audit Log (Optional but recommended for ISO compliance)
    -- INSERT INTO audit_logs (tenant_id, action, target_type, target_id, metadata) 
    -- VALUES (v_tenant_id, 'orchestrate_v5', 'conversation', v_conversation_id, jsonb_build_object('score', v_cumulative_risk_score));

    -- RETURN MASTER PACKAGE
    RETURN jsonb_build_object(
        'status', 'success',
        'agent', jsonb_build_object(
            'id', v_agent_id,
            'name', v_agent_name,
            'model_id', v_agent_config->>'modelId',
            'system_prompt', v_agent_config->>'systemPrompt',
            'user_prompt_template', v_agent_config->>'userPromptTemplate',
            'temperature', (v_agent_config->>'temperature')::NUMERIC,
            'max_tokens', COALESCE((v_agent_config->>'maxTokens')::INT, 2048),
            'greeting', v_agent_config->>'greetingMessage'
        ),
        'conversation', jsonb_build_object(
            'id', v_conversation_id,
            'history', COALESCE(v_history, '[]'::jsonb),
            'reopened', v_reopened
        ),
        'context', jsonb_build_object(
            'rag_knowledge', COALESCE(v_knowledge, '[]'::jsonb),
            'success_memories', COALESCE(v_memories, '[]'::jsonb),
            'rules', v_governance_rules
        ),
        'security', v_security_response
    );
END;
$$;

-- 3. Refactor Authentication Attempt for Identifier-based Sessions
CREATE OR REPLACE FUNCTION public.attempt_session_authentication_v2(
    p_agent_id UUID,
    p_user_identifier TEXT,
    p_identifier_to_validate TEXT,
    p_conversation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
    v_cleaned_input TEXT;
    v_clean_user_id TEXT;
    v_tenant_id UUID;
BEGIN
    -- 1. Setup identifiers
    v_clean_user_id := split_part(p_user_identifier, '@', 1);
    v_cleaned_input := regexp_replace(p_identifier_to_validate, '\D', '', 'g');
    
    SELECT tenant_id INTO v_tenant_id FROM agents WHERE id = p_agent_id;

    -- 2. Lookup/Create Session (Cross-conversation allowed)
    SELECT * INTO v_session
    FROM public.conversation_security_sessions
    WHERE tenant_id = v_tenant_id 
      AND user_identifier = v_clean_user_id 
      AND agent_id = p_agent_id;

    IF v_session IS NULL THEN
        INSERT INTO public.conversation_security_sessions (tenant_id, user_identifier, agent_id, conversation_id, status)
        VALUES (v_tenant_id, v_clean_user_id, p_agent_id, p_conversation_id, 'unauthenticated')
        RETURNING * INTO v_session;
    END IF;

    -- 3. Brute Force Protection
    IF v_session.status = 'locked' THEN
        IF v_session.locked_until > now() THEN
            RETURN jsonb_build_object('success', false, 'message', 'Security Triggered: Sessão bloqueada temporariamente.');
        ELSE
            UPDATE public.conversation_security_sessions 
            SET status = 'unauthenticated', failed_attempts = 0, locked_until = NULL, updated_at = now()
            WHERE id = v_session.id;
            v_session.status := 'unauthenticated';
        END IF;
    END IF;

    -- 4. Identity Validation (Logical Check)
    IF length(v_cleaned_input) IN (11, 14) THEN
        UPDATE public.conversation_security_sessions
        SET status = 'active', 
            validated_identifier = v_cleaned_input,
            failed_attempts = 0,
            expires_at = now() + interval '1 hour',
            updated_at = now(),
            conversation_id = COALESCE(p_conversation_id, conversation_id)
        WHERE id = v_session.id;

        RETURN jsonb_build_object('success', true, 'message', 'Autenticação concluída com sucesso.');
    ELSE
        -- Failed attempt
        UPDATE public.conversation_security_sessions
        SET failed_attempts = failed_attempts + 1,
            status = CASE WHEN failed_attempts + 1 >= 5 THEN 'locked' ELSE 'unauthenticated' END,
            locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END,
            updated_at = now()
        WHERE id = v_session.id
        RETURNING failed_attempts, status INTO v_session;

        RETURN jsonb_build_object(
            'success', false, 
            'message', 'Documento inválido. Tentativa ' || v_session.failed_attempts || ' de 5.'
        );
    END IF;
END;
$$;

-- Grant Permissions
GRANT EXECUTE ON FUNCTION orchestrate_ai_conversation_v5(TEXT, TEXT, TEXT, TEXT, VECTOR, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION attempt_session_authentication_v2(UUID, TEXT, TEXT, UUID) TO service_role;

-- Notify user about n8n changes
-- COMMENT ON FUNCTION orchestrate_ai_conversation_v5 IS 'Phase 1 Optimization: Master RPC that reduces roundtrips to 1 call. Requires Message Embedding for full RAG.';
