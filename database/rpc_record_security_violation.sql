CREATE OR REPLACE FUNCTION record_security_violation(
    p_tenant_id UUID,
    p_agent_id UUID,
    p_conversation_id UUID,
    p_violation_type TEXT,
    p_raw_message TEXT
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_incident_id UUID;
BEGIN
    INSERT INTO incidents (
        tenant_id,
        agent_id,
        conversation_id,
        title,
        description,
        severity
    ) VALUES (
        p_tenant_id,
        p_agent_id,
        p_conversation_id,
        'Security Violation: ' || p_violation_type,
        'Bloqueado pela Camada 1 (Guardrails). Message: ' || p_raw_message,
        'high'
    ) RETURNING id INTO v_incident_id;

    RETURN json_build_object(
        'success', true,
        'incident_id', v_incident_id
    );
END;
$$;
