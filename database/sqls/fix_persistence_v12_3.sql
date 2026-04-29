-- ========================================================================================
-- SISTEMA DE SEGURANÇA TRANSACIONAL V12.3 (ULTIMATE ACCURACY & LOGGING)
-- ========================================================================================

-- 1. TABELA DE LOGS PARA DIAGNÓSTICO (Se não existir)
CREATE TABLE IF NOT EXISTS public.security_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    agent_id UUID,
    conversation_id UUID,
    intent TEXT,
    result JSONB,
    input_params JSONB
);

-- 2. VALIDADOR DE IDENTIDADE: RESILIENTE E PRECISO
CREATE OR REPLACE FUNCTION public.mock_validate_identity(
    p_agent_id text, 
    p_conversation_id text, 
    p_doc text DEFAULT NULL, 
    p_identifier text DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_name VARCHAR;
    v_clean_doc VARCHAR;
    v_conv_id uuid;
    v_agent_id uuid;
    v_timeout INTEGER;
BEGIN
    -- Cast seguro de IDs
    BEGIN
        v_conv_id := TRIM(p_conversation_id)::uuid;
        v_agent_id := TRIM(p_agent_id)::uuid;
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('valid', false, 'message', 'IDs de conexão inválidos.');
    END;

    v_clean_doc := regexp_replace(COALESCE(p_doc, p_identifier), '\D', '', 'g');
    
    -- Busca na base legacy
    SELECT name INTO v_name FROM public.mock_customers 
    WHERE regexp_replace(cpf, '\D', '', 'g') = v_clean_doc;

    IF FOUND THEN
        -- Busca timeout
        SELECT COALESCE(session_timeout_seconds, 1200) INTO v_timeout FROM public.agents WHERE id = v_agent_id;
        
        -- UPSERT ATÔMICO
        INSERT INTO public.conversation_security_sessions (conversation_id, agent_id, status, validated_identifier, expires_at, updated_at)
        VALUES (v_conv_id, v_agent_id, 'active', v_clean_doc, now() + (COALESCE(v_timeout,1200) || ' seconds')::interval, now())
        ON CONFLICT (conversation_id, agent_id) 
        DO UPDATE SET 
            status = 'active',
            validated_identifier = v_clean_doc,
            expires_at = EXCLUDED.expires_at,
            updated_at = now();

        -- Log de sucesso
        INSERT INTO public.security_logs (agent_id, conversation_id, intent, result)
        VALUES (v_agent_id, v_conv_id, 'validate', jsonb_build_object('status', 'success', 'cpf', v_clean_doc));

        RETURN jsonb_build_object(
            'valid', true, 
            'message', 'Identidade confirmada! Bem-vindo(a) ' || v_name || '. Como posso te ajudar?',
            'active_cpf', v_clean_doc
        );
    ELSE
        RETURN jsonb_build_object('valid', false, 'message', 'Documento não localizado em nossa base financeira.');
    END IF;
END; $$;

-- 3. AVALIADOR DE SEGURANÇA: RESTAURA LÓGICA DE INTENÇÕES E MELHORA BUSCA
CREATE OR REPLACE FUNCTION public.evaluate_conversation_security(p_agent_id uuid, p_conversation_id uuid, p_intent text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_agent_config JSONB;
    v_identity_gate JSONB;
    v_is_enabled BOOLEAN;
    v_protected_intents TEXT[];
    v_session RECORD;
    v_timeout INTEGER;
    v_is_reset BOOLEAN;
BEGIN
    -- 1. Carrega Configuração do Agente
    SELECT brain_config, session_timeout_seconds INTO v_agent_config, v_timeout 
    FROM public.agents WHERE id = p_agent_id;

    v_identity_gate := v_agent_config->'capabilities'->'identity_gate';
    v_is_enabled := COALESCE((v_identity_gate->>'enabled')::boolean, false);
    
    -- Se o portão de identidade estiver desligado, libera tudo.
    IF NOT v_is_enabled THEN
        RETURN jsonb_build_object('allowToolExecution', true, 'requiresValidation', false, 'session_status', 'active');
    END IF;

    -- 2. Lista de intenções protegidas
    IF v_identity_gate->'protected_intents' IS NOT NULL AND jsonb_typeof(v_identity_gate->'protected_intents') = 'array' THEN
        SELECT ARRAY(SELECT jsonb_array_elements_text(v_identity_gate->'protected_intents')) INTO v_protected_intents;
    ELSE
        v_protected_intents := ARRAY[]::TEXT[];
    END IF;

    -- 3. Caso especial: RESET
    v_is_reset := p_intent IN ('logout', 'switch_user', 'reset_session', 'trocar_cpf', 'mudar_usuario');
    IF v_is_reset THEN
        UPDATE public.conversation_security_sessions SET status = 'expired', updated_at = now() WHERE conversation_id = p_conversation_id;
        RETURN jsonb_build_object('allowToolExecution', false, 'requiresValidation', true, 'session_status', 'unauthenticated');
    END IF;

    -- 4. Recupera Sessão Ativa
    SELECT * INTO v_session FROM public.conversation_security_sessions 
    WHERE conversation_id = p_conversation_id AND agent_id = p_agent_id
    LIMIT 1;

    -- 5. LÓGICA DE DECISÃO
    -- Se a sessão existe, está ativa e NÃO expirou por tempo
    IF v_session.id IS NOT NULL AND v_session.status = 'active' AND v_session.expires_at > now() THEN
        -- RENOVA TIMEOUT (Rolling Session)
        UPDATE public.conversation_security_sessions 
        SET expires_at = now() + (COALESCE(v_timeout, 1200) || ' seconds')::interval, updated_at = now()
        WHERE id = v_session.id;

        RETURN jsonb_build_object(
            'allowToolExecution', true, 
            'requiresValidation', false, 
            'session_status', 'active', 
            'validated_identifier', v_session.validated_identifier
        );
    END IF;

    -- 6. SE NÃO HÁ SESSÃO VÁLIDA:
    -- Só bloqueia se for uma intenção protegida!
    -- Isso permite que o usuário diga "oi" ou "quem é vc" sem ser barrado.
    IF p_intent = ANY(v_protected_intents) OR p_intent = 'boletos' THEN
        RETURN jsonb_build_object('allowToolExecution', false, 'requiresValidation', true, 'session_status', 'unauthenticated');
    ELSE
        RETURN jsonb_build_object('allowToolExecution', true, 'requiresValidation', false, 'session_status', 'unauthenticated');
    END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.evaluate_conversation_security(uuid, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mock_validate_identity(text, text, text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
