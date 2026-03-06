-- ========================================================================================
-- SISTEMA DE SEGURANÇA TRANSACIONAL V12.FINAL
-- ========================================================================================

-- 1. LIMPA SOBRAS ANTIGAS
DROP FUNCTION IF EXISTS public.evaluate_conversation_security(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.mock_validate_identity(text, text, text);
DROP FUNCTION IF EXISTS public.mock_validate_identity(text, text, text, text);
DROP FUNCTION IF EXISTS public.financial_get_customer_summary_safe(uuid, uuid);
DROP FUNCTION IF EXISTS public.financial_get_customer_summary_safe(uuid, uuid, text);

-- 2. VALIDADOR DE IDENTIDADE: ESTÁVEL E COM API CONTRACT CORRETO
CREATE OR REPLACE FUNCTION public.mock_validate_identity(
    p_agent_id text DEFAULT NULL, 
    p_conversation_id text DEFAULT NULL, 
    p_doc text DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_name VARCHAR;
    v_clean_doc VARCHAR;
    v_conv_uuid uuid;
    v_agent_uuid uuid;
    v_timeout INTEGER;
BEGIN
    -- Cast seguro do ID da conversa
    BEGIN
        v_conv_uuid := TRIM(p_conversation_id)::uuid;
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('valid', false, 'message', 'ID de conversa inválido.');
    END;

    -- Auto-descoberta do Agente para evitar o erro do n8n que vem sem ID
    IF p_agent_id IS NULL OR TRIM(p_agent_id) = '' OR p_agent_id = '00000000-0000-0000-0000-000000000000' THEN
        SELECT agent_id INTO v_agent_uuid FROM public.conversations WHERE id = v_conv_uuid LIMIT 1;
    ELSE
        BEGIN
            v_agent_uuid := TRIM(p_agent_id)::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_agent_uuid := NULL;
        END;
    END IF; -- << O ERRO SINTÁTICO ESTAVA AQUI! Era "END;" em vez de "END IF;"

    -- Extração de CPF
    v_clean_doc := regexp_replace(COALESCE(p_doc, ''), '\D', '', 'g');
    
    -- Busca cliente
    SELECT name INTO v_name FROM public.mock_customers WHERE regexp_replace(cpf, '\D', '', 'g') = v_clean_doc;

    IF FOUND THEN
        SELECT COALESCE(session_timeout_seconds, 1200) INTO v_timeout FROM public.agents WHERE id = v_agent_uuid;
        
        -- Atualiza/Cria sessão segura com o CPF novo
        INSERT INTO public.conversation_security_sessions (conversation_id, agent_id, status, validated_identifier, expires_at, updated_at)
        VALUES (v_conv_uuid, v_agent_uuid, 'active', v_clean_doc, now() + (COALESCE(v_timeout,1200) || ' seconds')::interval, now())
        ON CONFLICT (conversation_id, agent_id) DO UPDATE SET status = 'active', validated_identifier = v_clean_doc, expires_at = EXCLUDED.expires_at, updated_at = now();

        -- RETORNO EXATO QUE O AGENTE/N8N ESPERA PARA FALAR DEU TUDO CERTO
        RETURN jsonb_build_object(
            'valid', true, 
            'message', 'Identidade confirmada com sucesso! Bem-vindo(a) ' || v_name || '.',
            'active_cpf', v_clean_doc
        );
    ELSE
        RETURN jsonb_build_object('valid', false, 'message', 'Documento não reconhecido. Por favor, verifique o número.');
    END IF;
END; $$;

-- 3. AVALIADOR DE SEGURANÇA
CREATE OR REPLACE FUNCTION public.evaluate_conversation_security(p_agent_id uuid, p_conversation_id uuid, p_intent text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_session RECORD;
    v_is_enabled BOOLEAN;
    v_clean_intent TEXT;
BEGIN
    v_clean_intent := COALESCE(TRIM(LOWER(p_intent)), 'general');
    
    -- Se tem intenção de resetar (ex: trocar cpf), retorna false logo para invocar a msg de segurança
    IF v_clean_intent IN ('trocar_cpf', 'switch_user', 'logout', 'reset') THEN
        UPDATE public.conversation_security_sessions SET status = 'expired', updated_at = now() WHERE conversation_id = p_conversation_id;
        RETURN jsonb_build_object('allowToolExecution', false, 'requiresValidation', true, 'session_status', 'expired');
    END IF;

    -- Se não for boletos/financeiro, libere "allowToolExecution: true" para a IA lidar e receber o número do CPF digitado
    IF v_clean_intent NOT IN ('boletos', 'financeiro', 'faturas', 'debitos', 'consulta_boletos') THEN
        RETURN jsonb_build_object('allowToolExecution', true, 'requiresValidation', false);
    END IF;

    -- Busca sessão se for intenção protegida (ex: pedir boletos)
    SELECT * INTO v_session FROM public.conversation_security_sessions 
    WHERE conversation_id = p_conversation_id AND agent_id = p_agent_id LIMIT 1;

    -- Verifica validade da Sessão
    IF v_session.status = 'active' AND v_session.expires_at > now() THEN
        RETURN jsonb_build_object('allowToolExecution', true, 'requiresValidation', false, 'session_status', 'active', 'validated_identifier', v_session.validated_identifier);
    END IF;

    -- Se não tiver sessão e for boleto, barra.
    RETURN jsonb_build_object('allowToolExecution', false, 'requiresValidation', true, 'session_status', 'unauthenticated');
END; $$;

-- 4. FERRAMENTA DE CONSULTA ISOLADA (SEM RECEBER CPF)
CREATE OR REPLACE FUNCTION public.financial_get_customer_summary_safe(p_agent_id uuid, p_conversation_id uuid)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_sec JSONB;
BEGIN
    v_sec := public.evaluate_conversation_security(p_agent_id, p_conversation_id, 'boletos');
    
    IF (v_sec->>'allowToolExecution')::boolean = FALSE THEN
        RETURN jsonb_build_object('error', 'UNAUTHENTICATED', 'message', 'Sua sessão expirou ou CPF não validado. Por favor, reinicie e envie seu CPF.');
    END IF;

    -- Consome o CPF direto da porta blindada, evitando persistência incorreta
    RETURN public.mock_get_customer_summary(v_sec->>'validated_identifier');
END; $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
