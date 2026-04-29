
-- ============================================================================
-- NEXUS HUB: MASTER VOICE SYNC & AUDIT RPC (v1.1)
-- Objetivo: Sincronizar mensagens, billing, auditoria e ARTEFATOS em um único roundtrip.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_vapi_full_audit(
    p_vapi_payload JSONB,
    p_ai_analysis JSONB,   -- { sales_lead: {}, compliance_summary: {}, compliance_items: [] }
    p_tenant_id UUID DEFAULT NULL,
    p_agent_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_conversation_id UUID;
    v_tenant_id UUID;
    v_agent_id UUID;
    v_sync_res JSONB;
    v_item JSONB;
    v_incident_count INT := 0;
    v_user_identifier TEXT;
    v_call_id TEXT;
    v_recording_url TEXT;
BEGIN
    -- 1. IDENTIFY TENANT & AGENT (From payload or params)
    v_tenant_id := COALESCE(p_tenant_id, (p_vapi_payload->'message'->'call'->>'tenantId')::UUID);
    v_agent_id := COALESCE(p_agent_id, (p_vapi_payload->'message'->'call'->>'agentId')::UUID);
    v_call_id := p_vapi_payload->'message'->'call'->>'id';
    v_recording_url := p_vapi_payload->'message'->'artifact'->>'recordingUrl';

    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Missing Tenant ID');
    END IF;

    -- 2. CALL CORE SYNC (Messages & Duration)
    -- This handles the heavy lifting of message parsing and integration logs
    v_sync_res := public.sync_vapi_call(
        v_tenant_id, 
        p_vapi_payload, 
        p_vapi_payload->'message'->'customer'->>'number',
        p_vapi_payload->'message'->'customer'->>'name'
    );

    IF (v_sync_res->>'success')::BOOLEAN = FALSE THEN
        RETURN v_sync_res;
    END IF;

    v_conversation_id := (v_sync_res->>'conversation_id')::UUID;

    -- 3. UPDATE CONVERSATION METADATA WITH AI INSIGHTS
    UPDATE conversations 
    SET metadata = metadata || jsonb_build_object(
        'ai_sales_analysis', p_ai_analysis->'sales_lead',
        'ai_compliance_summary', p_ai_analysis->'compliance_summary',
        'voice_synced_at', NOW(),
        'vapi_recording_url', v_recording_url
    )
    WHERE id = v_conversation_id;

    -- 4. REGISTER AUDIO ARTIFACT (For the Sidebar Files panel)
    IF v_recording_url IS NOT NULL AND v_recording_url != '' THEN
        -- Check if artifact already exists to avoid duplication
        IF NOT EXISTS (SELECT 1 FROM conversation_artifacts WHERE external_url = v_recording_url) THEN
            INSERT INTO conversation_artifacts (
                tenant_id,
                conversation_id,
                platform,
                file_type,
                external_url,
                storage_path,
                metadata
            )
            VALUES (
                v_tenant_id,
                v_conversation_id,
                'vapi',
                'audio',
                v_recording_url,
                'vapi_recordings/' || v_call_id || '.wav',
                jsonb_build_object('vapi_call_id', v_call_id)
            );
        ELSE
            UPDATE conversation_artifacts 
            SET conversation_id = v_conversation_id,
                updated_at = NOW()
            WHERE external_url = v_recording_url;
        END IF;
    END IF;

    -- 5. GRANULAR INCIDENTS GENERATION (ISO 42001)
    -- Iterate over compliance markers found by the LLM
    IF p_ai_analysis->'compliance_items' IS NOT NULL AND jsonb_typeof(p_ai_analysis->'compliance_items') = 'array' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_ai_analysis->'compliance_items')
        LOOP
            -- Se o score de compliance for crítico (< 50)
            IF (v_item->>'score')::INT < 50 THEN
                v_incident_count := v_incident_count + 1;
                
                -- Inserir Incidente com alta clareza e sem UPPERCASE forçado
                INSERT INTO incidents (
                    tenant_id, 
                    agent_id, 
                    conversation_id, 
                    title, 
                    description, 
                    severity, 
                    status
                )
                VALUES (
                    v_tenant_id,
                    COALESCE(v_agent_id, (SELECT agent_id FROM conversations WHERE id = v_conversation_id)),
                    v_conversation_id,
                    'Auditoria Voz: ' || COALESCE(NULLIF(v_item->>'violation_type', 'none'), 'Violação de Conduta'),
                    'Uma falha de conformidade foi detectada nesta conversa.' || E'\n\n' ||
                    '● FRASE ANALISADA (Mensagem #' || (v_item->>'index') || '):' || E'\n' ||
                    '"' || (v_item->>'content') || '"' || E'\n\n' ||
                    '● PARECER DA IA (Score ' || (v_item->>'score') || '):' || E'\n' ||
                    (v_item->>'reason'),
                    (CASE WHEN (v_item->>'score')::INT < 30 THEN 'critical' ELSE 'high' END)::incident_severity,
                    'open'
                );
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'conversation_id', v_conversation_id,
        'incidents_created', v_incident_count,
        'call_id', v_call_id
    );
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.sync_vapi_full_audit(JSONB, JSONB, UUID, UUID) TO service_role;
