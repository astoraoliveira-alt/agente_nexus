-- ============================================================================
-- TRANSACTIONAL AGENT FRAMEWORK (B2B Identity Gate)
-- MVP Phase 1: Security Sessions and Gateway RPC
-- ============================================================================

-- 1. Create Enum for Security Status
DO $$ BEGIN
    CREATE TYPE session_security_status AS ENUM ('unauthenticated', 'active', 'locked', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Security Sessions Table
CREATE TABLE IF NOT EXISTS public.conversation_security_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    status session_security_status DEFAULT 'unauthenticated',
    validated_identifier VARCHAR(255),
    failed_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint: Only one session per conversation/agent combo
    UNIQUE (conversation_id, agent_id)
);

-- 3. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_conv_sec_session_conv ON public.conversation_security_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_sec_agent ON public.conversation_security_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_conv_sec_expires ON public.conversation_security_sessions(expires_at);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.conversation_security_sessions ENABLE ROW LEVEL SECURITY;

-- Policy to allow dashboard users to view sessions associated with their tenant's conversations
CREATE POLICY "Users can view security sessions of their tenant's conversations"
    ON public.conversation_security_sessions FOR SELECT
    USING (
        conversation_id IN (
            SELECT id FROM public.conversations
            WHERE tenant_id IN (
                SELECT c.id FROM public.companies c
                WHERE c.id = auth.uid() OR c.id IN (
                    SELECT tenant_id FROM public.users WHERE id = auth.uid()
                )
            )
        )
    );

-- 5. RPC Security Brain (evaluate_conversation_security)
CREATE OR REPLACE FUNCTION public.evaluate_conversation_security(
    p_agent_id UUID,
    p_conversation_id UUID,
    p_intent TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_agent_config JSONB;
    v_identity_gate JSONB;
    v_is_enabled BOOLEAN;
    v_protected_intents TEXT[];
    v_session RECORD;
BEGIN
    -- Step 1: Get Agent Capabilities
    SELECT brain_config INTO v_agent_config 
    FROM public.agents 
    WHERE id = p_agent_id;

    v_identity_gate := v_agent_config->'capabilities'->'identity_gate';
    v_is_enabled := COALESCE((v_identity_gate->>'enabled')::boolean, false);
    
    -- Feature Flag Rollout Strategy (Allow execution if security gate is disabled)
    IF NOT v_is_enabled THEN
        RETURN jsonb_build_object(
            'allowToolExecution', true,
            'requiresValidation', false,
            'session_status', 'unauthenticated'
        );
    END IF;

    -- Extract protected intents arrays safely
    IF v_identity_gate->'protected_intents' IS NOT NULL AND jsonb_typeof(v_identity_gate->'protected_intents') = 'array' THEN
        SELECT ARRAY(
            SELECT jsonb_array_elements_text(v_identity_gate->'protected_intents')
        ) INTO v_protected_intents;
    ELSE
        v_protected_intents := ARRAY[]::TEXT[];
    END IF;

    -- If intent is not protected, allow it
    IF NOT (p_intent = ANY(v_protected_intents)) THEN
        RETURN jsonb_build_object(
            'allowToolExecution', true,
            'requiresValidation', false,
            'session_status', 'unauthenticated'
        );
    END IF;

    -- Step 2: Check Session
    SELECT * INTO v_session
    FROM public.conversation_security_sessions
    WHERE conversation_id = p_conversation_id 
      AND agent_id = p_agent_id
    ORDER BY created_at DESC 
    LIMIT 1;

    -- Lazy Expiration Check
    IF v_session.expires_at IS NOT NULL AND v_session.expires_at < now() AND v_session.status = 'active' THEN
        UPDATE public.conversation_security_sessions 
        SET status = 'expired', updated_at = now()
        WHERE id = v_session.id;
        v_session.status := 'expired';
    END IF;

    -- Step 3: Evaluate Output
    IF v_session IS NOT NULL AND v_session.status = 'active' THEN
        -- Granted!
        RETURN jsonb_build_object(
            'allowToolExecution', true,
            'requiresValidation', false,
            'session_status', 'active',
            'validated_identifier', v_session.validated_identifier
        );
    ELSE
        -- Denied / Needs Validation
        RETURN jsonb_build_object(
            'allowToolExecution', false,
            'requiresValidation', true,
            'session_status', COALESCE(v_session.status::text, 'unauthenticated')
        );
    END IF;
END;
$$;
