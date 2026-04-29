CREATE OR REPLACE FUNCTION public.evaluate_conversation_security(p_agent_id uuid, p_conversation_id uuid, p_intent text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_agent_config JSONB;
    v_identity_gate JSONB;
    v_is_enabled BOOLEAN;
    v_protected_intents TEXT[];
    v_session RECORD;
    v_is_protected BOOLEAN := FALSE;
BEGIN
    SELECT brain_config INTO v_agent_config FROM public.agents WHERE id = p_agent_id;

    v_identity_gate := v_agent_config->'capabilities'->'identity_gate';
    v_is_enabled := COALESCE((v_identity_gate->>'enabled')::boolean, false);

    IF v_identity_gate->'protected_intents' IS NOT NULL AND jsonb_typeof(v_identity_gate->'protected_intents') = 'array' THEN
        SELECT ARRAY(SELECT jsonb_array_elements_text(v_identity_gate->'protected_intents')) INTO v_protected_intents;
    ELSE
        v_protected_intents := ARRAY[]::TEXT[];
    END IF;

    v_is_protected := p_intent = ANY(v_protected_intents);

    -- Check Session
    SELECT * INTO v_session
    FROM public.conversation_security_sessions
    WHERE conversation_id = p_conversation_id AND agent_id = p_agent_id
    ORDER BY created_at DESC LIMIT 1;

    -- Expire sessions if elapsed
    IF v_session.expires_at IS NOT NULL AND v_session.expires_at < now() AND v_session.status::text IN ('active', 'unauthenticated', 'locked') THEN
        UPDATE public.conversation_security_sessions
        SET status = 'expired', updated_at = now()
        WHERE id = v_session.id;
        v_session.status := 'expired';
    END IF;

    IF NOT v_is_enabled THEN
        RETURN jsonb_build_object('allowToolExecution', true, 'requiresValidation', false, 'session_status', 'unauthenticated');
    END IF;
    
    -- Handle Explicit Logout/Reset Intent
    IF p_intent IN ('logout', 'switch_user', 'reset_session') THEN
        IF v_session.id IS NOT NULL THEN
            UPDATE public.conversation_security_sessions
            SET status = 'expired', updated_at = now(), validated_identifier = NULL
            WHERE id = v_session.id;
        END IF;
        -- FORÇA O GATILHO DO GATEKEEPER IMEDIATAMENTE
        RETURN jsonb_build_object(
            'allowToolExecution', false, 
            'requiresValidation', true, 
            'session_status', 'unauthenticated', 
            'webhook_url', v_identity_gate->>'webhook_url'
        );
    END IF;

    -- State Machine logic: If intent is protected and no valid lock exists, CREATE or UPDATE an unauthenticated lock.
    IF v_is_protected AND (v_session.id IS NULL OR v_session.status::text = 'expired') THEN
        INSERT INTO public.conversation_security_sessions (conversation_id, agent_id, status, expires_at)
        VALUES (p_conversation_id, p_agent_id, 'unauthenticated', now() + interval '10 minutes')
        ON CONFLICT (conversation_id, agent_id) DO UPDATE 
        SET status = 'unauthenticated',
            expires_at = now() + interval '10 minutes',
            updated_at = now(),
            validated_identifier = NULL,
            failed_attempts = 0,
            locked_until = NULL
        RETURNING * INTO v_session;
    END IF;

    -- Evaluate routing depending heavily on the lock state (Not just the intent word string)
    IF v_session.id IS NOT NULL AND v_session.status::text = 'active' THEN
        -- Safely passed.
        RETURN jsonb_build_object('allowToolExecution', true, 'requiresValidation', false, 'session_status', 'active', 'validated_identifier', v_session.validated_identifier, 'webhook_url', v_identity_gate->>'webhook_url');
    ELSIF v_session.id IS NOT NULL AND v_session.status::text IN ('unauthenticated', 'locked') THEN
        -- Lock is engaged. Ignore whatever intent words the user sent! Only route them to Gatekeeper.
        RETURN jsonb_build_object('allowToolExecution', false, 'requiresValidation', true, 'session_status', v_session.status::text, 'webhook_url', v_identity_gate->>'webhook_url');
    ELSE
        -- Free path. No intent was hit and no lock is engaged.
        RETURN jsonb_build_object('allowToolExecution', true, 'requiresValidation', false, 'session_status', COALESCE(v_session.status::text, 'unauthenticated'), 'webhook_url', v_identity_gate->>'webhook_url');
    END IF;
END;
$function$;
