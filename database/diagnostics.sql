CREATE OR REPLACE FUNCTION public.get_security_diagnostics(p_conversation_id text)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_sessions JSONB;
    v_target_conv UUID;
BEGIN
    v_target_conv := p_conversation_id::uuid;
    
    SELECT jsonb_agg(sub) INTO v_sessions
    FROM (
        SELECT id, conversation_id, status, validated_identifier, updated_at, expires_at, (expires_at > now()) as is_valid_time
        FROM public.conversation_security_sessions
        WHERE conversation_id = v_target_conv
    ) sub;

    RETURN jsonb_build_object(
        'searched_id', p_conversation_id,
        'sessions_found', COALESCE(v_sessions, '[]'::jsonb),
        'server_time', now()
    );
END; $$;

GRANT EXECUTE ON FUNCTION public.get_security_diagnostics(text) TO anon, authenticated, service_role;
