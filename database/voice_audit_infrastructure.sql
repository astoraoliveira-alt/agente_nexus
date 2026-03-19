
-- ============================================================================
-- NEXUS HUB: INFRAESTRUTURA DE AUDITORIA GRANULAR PARA VOZ (VAPI)
-- Objetivo: Analisar conversas frase a frase, gerar incidentes e reputação.
-- ============================================================================

-- 1. RPC para Processar Auditoria Granular de Voz em Lote
CREATE OR REPLACE FUNCTION public.audit_voice_conversation_granular(
    p_conversation_id UUID,
    p_evaluations JSONB, 
    p_summary TEXT DEFAULT NULL,
    p_overall_sentiment TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_agent_id UUID;
    v_item JSONB;
    v_violation_count INT := 0;
    v_incident_id UUID;
    v_severity TEXT;
BEGIN
    -- 1. Buscar metadados da conversa
    SELECT tenant_id, agent_id INTO v_tenant_id, v_agent_id 
    FROM conversations 
    WHERE id = p_conversation_id;

    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Conversa não encontrada');
    END IF;

    -- 2. Atualizar metadados da conversa com o resumo e sentimento geral
    UPDATE conversations 
    SET metadata = metadata || jsonb_build_object(
        'voice_audit_summary', p_summary,
        'voice_audit_sentiment', p_overall_sentiment,
        'voice_audit_updated_at', NOW()
    )
    WHERE id = p_conversation_id;

    -- 3. Iterar sobre as avaliações granulares (JSON Array)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_evaluations)
    LOOP
        -- Se o score de compliance for crítico (< 50)
        IF (v_item->>'score')::INT < 50 THEN
            v_violation_count := v_violation_count + 1;
            
            -- Definir severidade baseada no score
            v_severity := CASE 
                WHEN (v_item->>'score')::INT < 30 THEN 'critical'
                ELSE 'high'
            END;

            -- Inserir Incidente para esta fala específica
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
                v_agent_id,
                p_conversation_id,
                'Violação Granular: ' || COALESCE(v_item->>'violation_type', 'Desconhecida'),
                'Frase: "' || (v_item->>'content') || '"' || E'\n' ||
                'Motivo: ' || (v_item->>'reason'),
                v_severity::incident_severity,
                'open'
            )
            RETURNING id INTO v_incident_id;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 
        'violations_found', v_violation_count,
        'conversation_id', p_conversation_id
    );
END;
$$;

-- 2. Trigger para Atualizar o Risco Global do Agente/Usuário
-- Essa lógica garante que os incidentes de voz computem para o bloqueio de segurança
CREATE OR REPLACE FUNCTION public.handle_incident_reputation()
RETURNS TRIGGER AS $$
DECLARE
    v_user_identifier TEXT;
BEGIN
    -- Se o incidente estiver vinculado a uma conversa
    IF NEW.conversation_id IS NOT NULL THEN
        SELECT user_identifier INTO v_user_identifier 
        FROM conversations 
        WHERE id = NEW.conversation_id;

        -- TODO: No futuro, podemos ter uma tabela 'user_reputation' por tenant.
        -- Por enquanto, os incidentes já são lidos pela evaluate_conversation_security.
        
        -- Logging informativo
        RAISE NOTICE 'Reputação do usuário % impactada por incidente %', v_user_identifier, NEW.severity;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_incident_reputation ON incidents;
CREATE TRIGGER trg_incident_reputation 
AFTER INSERT ON incidents 
FOR EACH ROW EXECUTE FUNCTION public.handle_incident_reputation();

-- 3. Permissões
GRANT EXECUTE ON FUNCTION public.audit_voice_conversation_granular(UUID, JSONB, TEXT, TEXT) TO service_role;

-- Comentário para o n8n
-- COMMENT ON FUNCTION audit_voice_conversation_granular IS 'Processa avaliações frase a frase vindas do n8n (VAPI Sync) e gera incidentes automáticos.';
